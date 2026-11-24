import SwiftUI

struct ActivityItem: Decodable, Identifiable {
    let id, total, seen: Int
    let kind, handle: String
    let post: String?
    var title: String {
        switch kind {
        case "request": "@"+handle+" sent you a friend request"
        case "accepted": "@"+handle+" accepted your friend request"
        case "comment": "@"+handle+" commented on your photo"
        default: "@"+handle+(total > 1 ? " and \(total-1) more liked your photo" : " liked your photo")
        }
    }
}
struct InboxPage: Decodable { let items: [ActivityItem]; let more, email: Bool }
struct ActivityScreen: View {
    let model: AppModel
    let showFriends: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var items = [ActivityItem]()
    @State private var more = false
    @State private var email = false
    @State private var busy = true
    @State private var error: String?
    @State private var detail: BlubPost?
    @State private var thread = false
    var body: some View {
        List {
            Section {
                Toggle("Weekly unread activity email", isOn: Binding(get: {email}, set: { value in Task {
                    busy = true; defer { busy = false }
                    do { try await model.service.write(["action":"digest","value":value ? "on" : "off"]); email = value }
                    catch { self.error = error.localizedDescription }
                }}))
                if let push = PushAlerts.current {
                    Button(push.enabled ? "Turn off push on this iPhone" : "Enable request and comment alerts") {
                        Task { if push.enabled { do { try await push.disable() } catch { self.error = error.localizedDescription } }
                               else { await push.enable() } }
                    }
                    if let problem = push.problem { Text(problem).font(.footnote) }
                }
            }
            ForEach(items) { item in Button(item.title) {
                if let id = item.post { Task { await open(id, comments: item.kind == "comment") } }
                else { showFriends() }
            }}
            if more { Button("Earlier activity") { Task { await load(older:true) } } }
            if busy { ProgressView() }
            if !busy && items.isEmpty && error == nil { Text("No activity yet.").foregroundStyle(.secondary) }
            if let error { Text(error); Button("Refresh") { Task { await load() } } }
        }.disabled(busy).navigationTitle("Activity").refreshable { await load() }
        .toolbar { Button("Done") { dismiss() } }.task {
            if let id=PushAlerts.current?.pendingEvent {
                PushAlerts.current?.pendingEvent=nil
                do {
                    let item:ActivityItem = try await model.service.read(["action":"activityItem","id":String(id)])
                    try await model.service.write(["action":"readActivity","ids":String(id)])
                    if let post=item.post { await open(post,comments:item.kind=="comment") }
                    else { showFriends();return }
                } catch { /* Revoked or removed items fall back to the live inbox. */ }
            }
            await load()
        }
        .sheet(item:$detail) { post in NavigationStack {
            if thread { CommentsScreen(post:post,model:model,changed:{}) }
            else { ScrollView { PostCard(post:detail ?? post,model:model,changed:{ await open(post.id,comments:false) }).padding() }
                .toolbar { Button("Done") { detail=nil } } }
        }}
    }
    private func open(_ id:String, comments:Bool) async {
        do { let post:BlubPost = try await model.service.read(["action":"post","id":id]); thread=comments;detail=post }
        catch { detail=nil;self.error=error.localizedDescription }
    }
    private func load(older:Bool=false) async {
        busy=true;defer{busy=false}
        do {
            var q=["action":"activity"]
            if older,let last=items.last { q["before"]=String(last.id) }
            let page:InboxPage = try await model.service.read(q)
            items=(older ? items : [])+page.items;more=page.more;email=page.email;error=nil
            let ids=page.items.filter{$0.seen==0}.map{String($0.id)}
            if !ids.isEmpty { try await model.service.write(["action":"readActivity","ids":ids.joined(separator:",")]) }
            await model.refreshBadge()
        } catch { self.error=error.localizedDescription }
    }
}
