import SwiftUI

struct MemberHandle: View {
    let handle: String
    let model: AppModel
    @State private var showing = false

    var body: some View {
        Button("@" + handle) { showing = true }
            .buttonStyle(.borderless)
            .accessibilityLabel("View @"+handle+"’s profile")
            .sheet(isPresented: $showing) {
                NavigationStack {
                    MemberProfile(handle: handle, model: model)
                        .toolbar { Button("Done") { showing = false } }
                }
            }
    }
}

private struct MemberProfile: View {
    struct Member: Decodable {
        let profile: FeedResponse.Profile
        let canView: Bool
        enum CodingKeys: String, CodingKey { case can_view }
        init(from decoder: Decoder) throws {
            profile = try FeedResponse.Profile(from: decoder)
            let fields = try decoder.container(keyedBy: CodingKeys.self)
            canView = try fields.decode(Int.self, forKey: .can_view) != 0
        }
    }
    let handle: String
    let model: AppModel
    @State private var member: Member?
    @State private var error: String?
    @State private var attempt = 0

    var body: some View {
        Group {
            if let member {
                ProfileScreen(model: model, me: member.profile, visiting: true, canView: member.canView)
            } else if let error {
                VStack { Text(error); Button("Retry") { attempt += 1 } }
            } else {
                ProgressView("Loading profile…")
            }
        }.task(id: attempt) {
            error = nil
            do { member = try await model.service.read(["action":"member", "handle":handle]) }
            catch { if !Task.isCancelled { self.error = error.localizedDescription } }
        }
    }
}
