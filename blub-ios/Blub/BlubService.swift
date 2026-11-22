import Foundation
import WebKit

struct BlubPost: Decodable, Identifiable {
    let id: String
    let handle: String
    let caption: String
    let created_at: Double
}

struct FeedResponse: Decodable {
    struct Profile: Decodable { let id: String }
    let authenticated: Bool
    let me: Profile?
    let posts: [BlubPost]?
}

enum BlubError: LocalizedError {
    case signIn, response(Int), invalid
    var errorDescription: String? {
        switch self {
        case .signIn: "Sign in with the account invited to Blub."
        case .response(let status): "Blub couldn’t complete the request (\(status))."
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

    private func request(_ query: [URLQueryItem] = []) async throws -> (Data, String?) {
        let url = Self.site.appending(path: "api/blub").appending(queryItems: query)
        let (data, response) = try await session.data(from: url)
        guard let http = response as? HTTPURLResponse else { throw BlubError.invalid }
        guard http.url?.host == Self.site.host, http.statusCode != 401, http.statusCode != 403,
              http.mimeType != "text/html" else { throw BlubError.signIn }
        guard http.statusCode == 200 else { throw BlubError.response(http.statusCode) }
        return (data, http.mimeType)
    }

    func feed() async throws -> FeedResponse {
        let (data, _) = try await request()
        return try JSONDecoder().decode(FeedResponse.self, from: data)
    }

    func photo(_ id: String) async throws -> UIImage {
        let (data, mime) = try await request([.init(name: "action", value: "photo"), .init(name: "id", value: id)])
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
