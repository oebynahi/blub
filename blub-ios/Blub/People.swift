import SwiftUI

struct FriendsScreen: View {
    let model: AppModel
    let me: FeedResponse.Profile
    @State private var query = ""
    @State private var results = [FeedResponse.Profile]()
    @State private var searched = false
    @State private var busy = false
    @State private var error: String?
    @State private var offerAlerts = false
    @State private var removal: Friendship?
    private var friends: [Friendship] { model.data?.friends ?? [] }
    var body: some View {
        List {
            Section("Find friends") {
                HStack {
                    TextField("Search @handle", text: $query).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .onSubmit { Task { await search() } }
                    Button("Find") { Task { await search() } }.disabled(query.count < 2)
                }
                if searched && results.isEmpty { Text("No matching handles.").foregroundStyle(.secondary) }
                ForEach(results) { person in
                    HStack {
                        AvatarView(id: person.id, name: person.name, version: person.avatar, service: model.service)
                        MemberHandle(handle: person.handle, model: model); Spacer()
                        if let match = friends.first(where: { $0.sender == person.id || $0.recipient == person.id }) {
                            Text(match.status == "accepted" ? "Friends" : "Pending").font(.caption)
                        } else { Button("Add") { Task { await update(["action":"request","user":person.id]) } } }
                    }
                }
            }
            Section("Requests") { ForEach(friends.filter { $0.status != "accepted" }) { row in personRow(row) } }
            Section("Friends") {
                if !friends.contains(where: { $0.status == "accepted" }) { Text("No friends added yet.").foregroundStyle(.secondary) }
                ForEach(friends.filter { $0.status == "accepted" }) { row in personRow(row) }
            }
            if let error { Text(error).foregroundStyle(.pink) }
        }.disabled(busy).navigationTitle("Friends").refreshable { await model.load() }
        .alert("Get alerts for friend requests and comments?",isPresented:$offerAlerts) {
            Button("Enable alerts") { Task { await PushAlerts.current?.enable() } }
            Button("Later",role:.cancel) {}
        }
        .confirmationDialog("Remove @"+(removal?.handle ?? "")+" from friends?", isPresented: Binding(get: { removal != nil }, set: { if !$0 { removal = nil } }), titleVisibility: .visible, presenting: removal) { row in
            Button("Remove friend", role: .destructive) { Task { await update(["action":"remove","id":row.id]) } }
        }
    }
    private func personRow(_ row: Friendship) -> some View {
        HStack {
            AvatarView(id: row.sender == me.id ? row.recipient : row.sender, name: row.name, version: row.avatar, service: model.service)
            VStack(alignment: .leading) { Text(row.name); MemberHandle(handle: row.handle, model: model).foregroundStyle(.secondary).font(.caption) }
            Spacer()
            if row.status == "accepted" {
                Menu { Button("Remove friend", role: .destructive) { removal = row } } label: { Image(systemName: "ellipsis") }
            } else if row.recipient == me.id {
                Button("Accept") { Task { await update(["action":"accept","id":row.id]) } }
                Button("Decline") { Task { await update(["action":"remove","id":row.id]) } }
            } else { Button("Cancel request") { Task { await update(["action":"remove","id":row.id]) } } }
        }.buttonStyle(.borderless)
    }
    private func search() async {
        guard query.count >= 2, !busy else { return }; busy = true; defer { busy = false }
        do { let page: SearchPage = try await model.service.read(["action":"search","q":query]); results = page.users; searched = true; error = nil }
        catch { self.error = error.localizedDescription }
    }
    private func update(_ values: [String:String]) async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do { try await model.service.write(values); error = nil; await model.load()
            if values["action"]=="request",!UserDefaults.standard.bool(forKey:"offered-push-"+me.id),PushAlerts.current?.enabled != true {
                UserDefaults.standard.set(true,forKey:"offered-push-"+me.id);offerAlerts=true
            }
        }
        catch { self.error = error.localizedDescription }
    }
}

struct ProfileScreen: View {
    let model: AppModel
    let me: FeedResponse.Profile
    var visiting = false
    var canView = true
    @State private var posts = [BlubPost]()
    @State private var more = false
    @State private var edit = false
    @State private var detail = false
    @State private var selected = ""
    @State private var revision = 0
    @State private var count = 0
    @State private var error: String?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    AvatarView(id: me.id, name: me.name, version: me.avatar, service: model.service, size: 60)
                    VStack(alignment: .leading) { Text(me.name).font(.title3.bold()); Text("@"+me.handle).foregroundStyle(.secondary); if !me.bio.isEmpty { Text(me.bio).font(.callout) } }
                    Spacer()
                    if !visiting { Button("Edit") { edit = true } }
                }.padding().chromeCard()
                if !canView { Text("Photos are shared with friends.").foregroundStyle(.secondary) } else {
                    Text(visiting ? "Photos" : "Your photos").font(.headline)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 3), spacing: 5) {
                        ForEach(posts) { post in
                            Button { selected = post.id; detail = true } label: {
                                Color.black.aspectRatio(1, contentMode: .fit).overlay {
                                    PrivatePhoto(id: post.id, service: model.service, thumbnail: true)
                                }.clipShape(RoundedRectangle(cornerRadius: 9))
                            }.accessibilityLabel(post.caption.isEmpty ? "Open photo" : post.caption)
                        }
                    }
                    if posts.isEmpty && count > 0 && error == nil { Text(visiting ? "No photos yet." : "Your photos will appear here.").foregroundStyle(.secondary) }
                    if more { Button("More photos") { Task { await load(older: true) } } }
                    if let error { Text(error); Button("Retry") { Task { await load() } } }
                }
            }.padding()
        }.background(ink).navigationTitle("Profile").refreshable { await model.load(); await load() }
        .toolbar { if !visiting { Menu { Button("Sign out", role: .destructive) { Task { await model.logout() } } } label: { Image(systemName: "ellipsis.circle") } } }
        .sheet(isPresented: $edit) { NavigationStack { Editor(model: model, mode: .profile(me)) } }
        .sheet(isPresented: $detail) {
            NavigationStack {
                if let post = posts.first(where: { $0.id == selected }) {
                    ScrollView { PostCard(post: post, model: model, changed: { await load(keepSelection: true) }).padding() }
                        .navigationTitle("Photo").navigationBarTitleDisplayMode(.inline).toolbar { Button("Done") { detail = false } }
                }
            }
        }.task { await load() }
    }
    private func load(older: Bool = false, keepSelection: Bool = false) async {
        guard canView else { return }
        revision += 1; let token = revision
        var rows = older ? posts : []
        do {
            var hasMore = false
            repeat {
                var q = visiting ? ["action":"memberPhotos", "id":me.id] : ["action":"mine"]
                if let last = rows.last { q["before"] = last.id; q["time"] = String(Int64(last.created_at)) }
                let page: PostPage = try await model.service.read(q)
                rows += page.posts; hasMore = page.more
            } while keepSelection && hasMore && rows.count < posts.count
            guard token == revision else { return }
            posts = rows; more = hasMore; count += 1; error = nil
            if detail && !rows.contains(where: { $0.id == selected }) { detail = false }
        } catch { if token == revision { self.error = error.localizedDescription } }
    }
}
