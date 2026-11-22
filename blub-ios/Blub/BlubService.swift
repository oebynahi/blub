import Foundation
import WebKit

struct BlubPost: Decodable, Identifiable, Hashable {
    let id: String
    let handle: String
    let caption: String
    let author: String
    let avatar: String?
    let liked, like_count, comment_count: Int
    let created_at: Double
}

struct FeedResponse: Decodable {
    struct Profile: Decodable, Identifiable { let id, name, handle, bio: String; let avatar: String? }
    let friends: [Friendship]?
    let authenticated: Bool
    let me: Profile?
    let posts: [BlubPost]?
}

struct Friendship: Decodable, Identifiable {
    let id, sender, recipient, status, name, handle: String
    let avatar: String?
}
struct Comment: Decodable, Identifiable { let id: Int; let body, handle: String }
struct CommentPage: Decodable { let comments: [Comment]; let more: Bool }
struct PostPage: Decodable { let posts: [BlubPost]; let more: Bool }
struct SearchPage: Decodable { let users: [FeedResponse.Profile] }

enum BlubError: LocalizedError {
    case signIn, response(Int), message(String), invalid
    var errorDescription: String? {
        switch self {
        case .signIn: "Sign in with the account invited to Blub."
        case .response(let status): "Blub couldn’t complete the request (\(status))."
        case .message(let message): message
        case .invalid: "Blub returned an unexpected response."
        }
    }
}

@MainActor
final class BlubService {
    static let site = URL(string: "https://blub-friends.halecashew.chatgpt.site")!
    private var session = URLSession(configuration: .ephemeral)

    // Let the system cookie jar apply domain, path, expiry and Secure rules.
    // Only copy site-scoped cookies. Identity-provider cookies stay in WebKit.
    func syncSiteSession() async {
        let cookies = await WKWebsiteDataStore.default().httpCookieStore.allCookies()
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil
        config.timeoutIntervalForRequest = 20
        let host = Self.site.host!
        for cookie in cookies {
            let domain = cookie.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")).lowercased()
            if host == domain || host.hasSuffix("." + domain) {
                config.httpCookieStorage?.setCookie(cookie)
            }
        }
        session.invalidateAndCancel()
        session = URLSession(configuration: config)
    }

    private func request(_ query: [URLQueryItem] = [], body: Data? = nil, type: String = "application/json") async throws -> (Data, String?) {
        let url = Self.site.appending(path: "api/blub").appending(queryItems: query)
        var request = URLRequest(url: url)
        if let body {
            request.httpMethod = "POST"
            request.httpBody = body
            request.setValue(type, forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw BlubError.invalid }
        guard http.url?.host == Self.site.host, http.statusCode != 401, http.statusCode != 403,
              http.mimeType != "text/html" else { throw BlubError.signIn }
        guard http.statusCode == 200 else {
            if let payload = try? JSONDecoder().decode([String:String].self, from: data), let message = payload["error"] {
                throw BlubError.message(message)
            }
            throw BlubError.response(http.statusCode)
        }
        return (data, http.mimeType)
    }

    func feed() async throws -> FeedResponse {
        let (data, _) = try await request()
        return try JSONDecoder().decode(FeedResponse.self, from: data)
    }

    func read<T: Decodable>(_ query: [String:String]) async throws -> T {
        let (data, _) = try await request(query.map { URLQueryItem(name: $0.key, value: $0.value) })
        return try JSONDecoder().decode(T.self, from: data)
    }

    func write(_ fields: [String:String], image: Data? = nil, field: String = "photo") async throws {
        let result: Data
        if let image {
            let boundary = UUID().uuidString
            var body = Data()
            for (key, value) in fields {
                body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(key)\"\r\n\r\n\(value)\r\n".utf8))
            }
            body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(field)\"; filename=\"photo.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".utf8))
            body.append(image)
            body.append(Data("\r\n--\(boundary)--\r\n".utf8))
            result = try await request(body: body, type: "multipart/form-data; boundary=\(boundary)").0
        } else {
            result = try await request(body: JSONEncoder().encode(fields)).0
        }
        guard (try? JSONDecoder().decode([String:Bool].self, from: result)["ok"]) == true else { throw BlubError.invalid }
    }

    func photo(_ id: String, avatar: String? = nil) async throws -> UIImage {
        var query = [URLQueryItem(name: "action", value: avatar == nil ? "photo" : "avatar"), .init(name: "id", value: id)]
        if let avatar { query.append(.init(name: "v", value: avatar)) }
        let (data, mime) = try await request(query)
        guard mime?.hasPrefix("image/") == true, let image = UIImage(data: data) else { throw BlubError.invalid }
        return image
    }

    func signOut() async {
        session.invalidateAndCancel()
        let store = WKWebsiteDataStore.default()
        await store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast)
        session = URLSession(configuration: .ephemeral)
    }
}
