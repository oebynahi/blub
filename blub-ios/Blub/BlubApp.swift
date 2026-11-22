import SwiftUI

@main
struct BlubApp: App {
    var body: some Scene { WindowGroup { FeedScreen().preferredColorScheme(.dark) } }
}

private enum FeedState {
    case loading, signedOut, needsProfile, ready([BlubPost]), failed(String)
}

struct FeedScreen: View {
    @State private var service = BlubService()
    @State private var phase = FeedState.loading
    @State private var accountOpen = false
    @State private var browserProblem: String?
    @State private var revision = 0

    private var accountURL: URL {
        if case .needsProfile = phase { return BlubService.site.appending(path: "feed") }
        return BlubService.site.appending(path: "signin-with-chatgpt")
            .appending(queryItems: [.init(name: "return_to", value: "/feed")])
    }

    private func load() async {
        revision += 1
        let token = revision
        do {
            let result = try await service.feed()
            guard token == revision else { return }
            if !result.authenticated { phase = .signedOut }
            else if result.me == nil { phase = .needsProfile }
            else if let posts = result.posts { phase = .ready(posts); accountOpen = false }
            else { phase = .failed("Blub couldn’t read your feed.") }
        } catch {
            guard token == revision, !Task.isCancelled else { return }
            if case BlubError.signIn = error { phase = .signedOut }
            else { phase = .failed(error.localizedDescription) }
        }
    }

    private func refreshAccount() async {
        await service.syncSiteSession()
        await load()
    }

    var body: some View {
        NavigationStack {
            Group {
                switch phase {
                case .loading:
                    ProgressView("Loading feed…")
                case .signedOut:
                    accountPrompt("Your friends’ photos", "Sign in with your existing Blub account.", "Sign in to Blub")
                case .needsProfile:
                    accountPrompt("Create your profile", "Choose the name and handle your friends will see.", "Set up profile")
                case .failed(let message):
                    ContentUnavailableView {
                        Label("Couldn’t load Blub", systemImage: "wifi.exclamationmark")
                    } description: { Text(message) } actions: {
                        Button("Try again") { Task { await refreshAccount() } }
                    }
                case .ready(let posts):
                    ScrollView {
                        LazyVStack(spacing: 20) {
                            if posts.isEmpty {
                                ContentUnavailableView("No photos yet", systemImage: "photo.on.rectangle",
                                    description: Text("Photos from you and your friends will appear here."))
                            }
                            ForEach(posts) { post in PostCard(post: post, service: service) }
                        }.padding()
                    }
                    .refreshable { await load() }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(red: 0.032, green: 0.035, blue: 0.047))
            .navigationTitle("Blub")
            .toolbar {
                if case .ready = phase {
                    Button("Sign out") {
                        revision += 1
                        phase = .loading
                        Task { await service.signOut(); phase = .signedOut }
                    }
                }
            }
        }
        .task { await refreshAccount() }
        .sheet(isPresented: $accountOpen) {
            NavigationStack {
                HostedAccount(url: accountURL, reachedFeed: { Task { await refreshAccount() } },
                              problem: $browserProblem)
                    .safeAreaInset(edge: .bottom) {
                        if let browserProblem { Text(browserProblem).font(.footnote).padding() }
                    }
                    .navigationTitle("Blub account").navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Close") { accountOpen = false } }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { accountOpen = false; Task { await refreshAccount() } }
                        }
                    }
            }
        }
    }

    private func accountPrompt(_ title: String, _ detail: String, _ action: String) -> some View {
        VStack(spacing: 16) {
            Image("Chrome").resizable().scaledToFit().frame(width: 88, height: 88).accessibilityHidden(true)
            Text(title).font(.title.bold())
            Text(detail).foregroundStyle(.secondary).multilineTextAlignment(.center)
            Button(action) { browserProblem = nil; accountOpen = true }
                .buttonStyle(.borderedProminent).tint(Color(red: 0.78, green: 0.67, blue: 0.96))
                .foregroundStyle(.black)
        }.padding(28)
    }
}

private struct PostCard: View {
    let post: BlubPost
    let service: BlubService
    @State private var image: UIImage?
    @State private var failed = false
    @State private var attempt = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Group {
                if let image {
                    Image(uiImage: image).resizable().scaledToFit()
                        .accessibilityLabel(post.caption.isEmpty ? "Photo from @"+post.handle : post.caption)
                } else if failed {
                    Button("Retry photo") { attempt += 1 }.frame(maxWidth: .infinity, minHeight: 160)
                } else { ProgressView().frame(maxWidth: .infinity, minHeight: 160) }
            }.clipShape(RoundedRectangle(cornerRadius: 16))
            HStack {
                Text("@"+post.handle).font(.headline)
                Spacer()
                Text(Date(timeIntervalSince1970: post.created_at / 1000), style: .date)
                    .font(.caption).foregroundStyle(.secondary)
            }
            if !post.caption.isEmpty { Text(post.caption) }
        }
        .padding(12).background(.white.opacity(0.065), in: RoundedRectangle(cornerRadius: 22))
        .task(id: attempt) {
            guard image == nil else { return }
            failed = false
            do { let loaded = try await service.photo(post.id); if !Task.isCancelled { image = loaded } }
            catch { if !Task.isCancelled { failed = true } }
        }
    }
}
