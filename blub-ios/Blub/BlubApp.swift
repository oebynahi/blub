import SwiftUI

@main
struct BlubApp: App {
    @UIApplicationDelegateAdaptor(PushAlerts.self) private var push
    var body: some Scene { WindowGroup { FeedScreen().preferredColorScheme(.dark) } }
}

let ink = Color(red: 0.032, green: 0.035, blue: 0.047)
let violet = Color(red: 0.76, green: 0.64, blue: 1)
let sunset = LinearGradient(colors: [violet, Color(red: 1, green: 0.72, blue: 0.59)], startPoint: .leading, endPoint: .trailing)
extension View {
    func chromeCard(radius: CGFloat = 22, lineWidth: CGFloat = 1) -> some View {
        background(ink, in: RoundedRectangle(cornerRadius: radius))
            .overlay { RoundedRectangle(cornerRadius: radius).strokeBorder(
                AngularGradient(colors: [.indigo.opacity(0.5), .white.opacity(0.8), .gray.opacity(0.3), .indigo, .white.opacity(0.65), .indigo.opacity(0.5)], center: .center), lineWidth: lineWidth).allowsHitTesting(false) }
    }
}

struct Wordmark: View {
    var size: CGFloat = 44
    var body: some View {
        HStack(spacing: size * 0.15) {
            Image("Chrome").resizable().scaledToFit().frame(width: size, height: size).accessibilityHidden(true)
            Text("blub").font(.system(size: size, weight: .semibold)).tracking(-size * 0.055)
        }.accessibilityLabel("Blub")
    }
}

@MainActor @Observable final class AppModel {
    let service = BlubService()
    var data: FeedResponse?
    var initialError: String?
    var revision = 0
    func load() async {
        revision += 1
        let token = revision
        do {
            let result = try await service.feed()
            guard token == revision else { return }
            data = result; initialError = nil
        } catch {
            guard token == revision, !Task.isCancelled else { return }
            if case BlubError.signIn = error { data = FeedResponse(friends: nil, authenticated: false, me: nil, posts: nil); initialError = nil }
            else { initialError = error.localizedDescription }
        }
    }
    func connect() async { await service.syncSiteSession(); await load() }
    func refreshBadge() async {
        let owner=data?.me?.id
        if let response:[String:Bool] = try? await service.read(["action":"badge"]), owner == data?.me?.id {
            data?.unread=response["unread"]
        }
    }
    func logout() async {
        do { try await PushAlerts.current?.disable() } catch { initialError=error.localizedDescription; return }
        revision += 1; data = nil; await service.signOut(); await load() }
}

struct FeedScreen: View {
    @State private var model = AppModel()
    @State private var auth = false
    @State private var signup = false
    @State private var browserProblem: String?
    var body: some View {
        Group {
            if let me = model.data?.me {
                MainTabs(model: model, me: me).id(me.id)
            } else if model.data?.authenticated == true {
                NavigationStack { Editor(model: model, mode: .profile(nil))
                    .toolbar { Button("Sign out") { Task { await model.logout() } } } }
            } else if let problem = model.initialError {
                ContentUnavailableView { Label("Couldn’t load Blub", systemImage: "wifi.exclamationmark") }
                    description: { Text(problem) } actions: { Button("Retry") { Task { await model.connect() } } }
            } else if model.data != nil {
                VStack(spacing: 20) {
                    Wordmark(size: 58)
                    Text("Your photos. Your friends.").font(.title3.weight(.medium)).foregroundStyle(sunset)
                    Button("Sign in to Blub") { signup = false; browserProblem = nil; auth = true }
                        .buttonStyle(.borderedProminent).tint(violet).foregroundStyle(.black)
                    Button("Create an account") { signup = true; browserProblem = nil; auth = true }
                }.padding()
            } else { BlubLoadingView() }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity).background(ink).tint(violet)
        .task { await model.connect() }
        .sheet(isPresented: $auth) {
            NavigationStack {
                VStack(spacing: 0) {
                    if signup { Text("Continue with ChatGPT, then choose your Blub handle.").font(.callout).padding() }
                    HostedAccount(url: BlubService.site.appending(path: "signin-with-chatgpt").appending(queryItems: [.init(name: "return_to", value: "/feed")]),
                        reachedFeed: { Task { await model.connect(); if model.data?.authenticated == true { auth = false } } }, problem: $browserProblem)
                    if let browserProblem { Text(browserProblem).font(.footnote).padding() }
                }.navigationTitle(signup ? "Create an account" : "Sign in").navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Close") { auth = false } }
                        ToolbarItem(placement: .confirmationAction) { Button("Done") { auth = false; Task { await model.connect() } } }
                    }
            }
        }
    }
}

private struct BlubLoadingView: View {
    @Environment(\.accessibilityReduceMotion) private var reduced
    @State private var spin = false
    var body: some View {
        VStack(spacing: 18) {
            Image("Chrome").resizable().scaledToFit().frame(width: 58, height: 58)
                .rotationEffect(.degrees(spin && !reduced ? 360 : 0))
                .animation(reduced ? nil : .linear(duration: 1.6).repeatForever(autoreverses: false), value: spin)
            ProgressView().accessibilityLabel("Loading Blub")
        }.onAppear { spin = true }
    }
}

private struct SinglePostPaging: ScrollTargetBehavior {
    func updateTarget(_ target: inout ScrollTarget, context: TargetContext) {
        PagingScrollTargetBehavior().updateTarget(&target, context: context)
        let height = context.containerSize.height
        guard height > 0 else { return }
        let start = (context.originalTarget.rect.minY / height).rounded()
        let proposed = (target.rect.minY / height).rounded()
        let next = min(start + 1, max(start - 1, proposed))
        target.rect.origin.y = max(0, min(next * height, context.contentSize.height - height))
    }
}

struct MainTabs: View {
    let model: AppModel
    let me: FeedResponse.Profile
    @State private var compose = false
    @State private var activity = false
    @State private var tab = 0
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        TabView(selection:$tab) {
            NavigationStack {
                ScrollView(.vertical) {
                    if let posts = model.data?.posts, !posts.isEmpty {
                        LazyVStack(spacing: 0) {
                            ForEach(posts) { post in
                                PostCard(post: post, model: model, paged: true)
                                    .padding(.horizontal, 12).padding(.vertical, 6)
                                    .containerRelativeFrame(.vertical)
                            }
                        }.scrollTargetLayout()
                    } else {
                        ContentUnavailableView("No photos yet", systemImage: "photo.on.rectangle",
                            description: Text("Post a photo or add a friend."))
                    }
                }
                .scrollTargetBehavior(SinglePostPaging())
                .scrollIndicators(.hidden).background(ink).refreshable { await model.load() }
                .toolbar(.hidden, for: .navigationBar)
                .safeAreaInset(edge: .top, spacing: 0) {
                    HStack {
                        Wordmark(size: 32).fixedSize()
                        Spacer()
                        Button { activity = true } label: {
                            Image(systemName: model.data?.unread == true ? "bell.badge.fill" : "bell")
                                .frame(width:44,height:44)
                        }.accessibilityLabel(model.data?.unread == true ? "Activity, unread notifications" : "Activity")
                        Button { compose = true } label: {
                            Image(systemName: "plus").frame(width: 44, height: 44)
                        }.accessibilityLabel("Post a photo")
                    }.padding(.horizontal, 16).padding(.vertical, 4).background(ink)
                }
            }.tabItem { Label("Feed", systemImage: "house") }.tag(0)
            NavigationStack { FriendsScreen(model: model, me: me) }.tabItem { Label("Friends", systemImage: "person.2") }.tag(1)
            NavigationStack { ProfileScreen(model: model, me: me) }.tabItem { Label("Profile", systemImage: "person.crop.circle") }.tag(2)
        }.sheet(isPresented: $compose) { NavigationStack { Editor(model: model, mode: .post) } }
        .task(id:me.id) { PushAlerts.current?.attach(model,user:me.id) }
        .task(id:scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled { await model.refreshBadge(); do { try await Task.sleep(for:.seconds(45)) } catch { return } }
        }
        .onChange(of:PushAlerts.current?.openInbox,initial:true) {
            if PushAlerts.current?.openInbox == true { activity=true;PushAlerts.current?.openInbox=false }
        }
        .sheet(isPresented:$activity) { NavigationStack { ActivityScreen(model:model,showFriends:{
            activity=false;tab=1;Task { await model.load() }
        }) } }
        .alert("Couldn’t refresh Blub", isPresented: Binding(get: { model.initialError != nil }, set: { if !$0 { model.initialError = nil } })) {
            Button("Retry") { Task { await model.load() } }; Button("Close", role: .cancel) {}
        } message: { Text(model.initialError ?? "") }
    }
}
