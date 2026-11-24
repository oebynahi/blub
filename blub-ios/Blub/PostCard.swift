import SwiftUI

struct PrivatePhoto: View {
    let id: String
    var avatar: String? = nil
    let service: BlubService
    var thumbnail = false
    @State private var image: UIImage?
    @State private var failed = false
    @State private var retry = 0
    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().aspectRatio(contentMode: thumbnail ? .fill : .fit)
            } else if failed {
                Button { retry += 1 } label: { Image(systemName: "arrow.clockwise") }.accessibilityLabel("Retry photo")
            } else { ProgressView() }
        }
        .task(id: "\(id)/\(avatar ?? "")/\(retry)") {
            image = nil; failed = false
            do { let value = try await service.photo(id, avatar: avatar); try Task.checkCancellation(); image = value }
            catch { if !Task.isCancelled { failed = true } }
        }
    }
}

struct AvatarView: View {
    let id: String, name: String
    let version: String?
    let service: BlubService
    var size: CGFloat = 36
    var body: some View {
        ZStack {
            Circle().fill(.indigo.opacity(0.32))
            if let version { PrivatePhoto(id: id, avatar: version, service: service, thumbnail: true) }
            else { Text(String(name.prefix(1)).uppercased()).font(.headline) }
        }.frame(width: size, height: size).clipShape(Circle()).accessibilityHidden(true)
    }
}

struct PostCard: View {
    let post: BlubPost
    let model: AppModel
    var paged = false
    var changed: () async -> Void = {}
    @Environment(\.displayScale) private var displayScale
    @Environment(\.accessibilityReduceMotion) private var reduced
    @State private var busy = false
    @State private var comments = false
    @State private var fullCaption = false
    @State private var confirm = false
    @State private var pulse = 0
    @State private var showHeart = false
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            PrivatePhoto(id: post.id, service: model.service)
                .frame(maxWidth: .infinity, minHeight: paged ? 0 : 140, maxHeight: paged ? .infinity : nil)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .overlay {
                    if showHeart {
                        Image("ChromeHeart").resizable().scaledToFit().frame(width: 105)
                            .transition(reduced ? .opacity : .scale(scale: 0.4).combined(with: .opacity))
                            .allowsHitTesting(false).accessibilityHidden(true)
                    }
                }
                .contentShape(Rectangle()).onTapGesture(count: 2) { like(doubleTap: true) }
                .accessibilityLabel(post.caption.isEmpty ? "Photo from @"+post.handle : post.caption)
            HStack(spacing: 8) {
                AvatarView(id: post.author, name: post.handle, version: post.avatar, service: model.service)
                VStack(alignment: .leading) {
                    Text("@"+post.handle).font(.subheadline.bold()).lineLimit(1)
                    Text(Date(timeIntervalSince1970: post.created_at/1000), style: .date).font(.caption2).foregroundStyle(.secondary)
                }
                Spacer()
                Button { like(doubleTap: false) } label: {
                    Label(String(post.like_count), systemImage: post.liked == 0 ? "heart" : "heart.fill")
                }.accessibilityLabel(post.liked == 0 ? "Like post" : "Unlike post").disabled(busy)
                Button { comments = true } label: { Label(String(post.comment_count), systemImage: "bubble.right") }.accessibilityLabel("Comments")
                if post.author == model.data?.me?.id {
                    Menu { Button("Delete post", role: .destructive) { confirm = true } } label: { Image(systemName: "ellipsis") }.accessibilityLabel("Post options")
                }
            }.font(.subheadline)
            if !post.caption.isEmpty {
                if paged {
                    Button { fullCaption = true } label: { Text(post.caption).lineLimit(2).multilineTextAlignment(.leading) }
                        .foregroundStyle(.primary).accessibilityHint("Opens the full caption")
                } else { Text(post.caption) }
            }
            if let previews = post.preview_comments, !previews.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(previews) { comment in
                        (Text("@"+comment.handle+" ").bold() + Text(comment.body))
                            .font(.footnote).lineLimit(1).foregroundStyle(.secondary)
                    }
                }
            }
            if let error { Text(error).font(.footnote).foregroundStyle(.pink) }
        }.padding(10).chromeCard(lineWidth: 1 / displayScale)
        .sensoryFeedback(.impact(weight: .light), trigger: pulse)
        .task(id: pulse) {
            guard pulse > 0 else { return }
            do { try await Task.sleep(for: .milliseconds(680)); withAnimation(.easeOut(duration: 0.2)) { showHeart = false } } catch {}
        }
        .sheet(isPresented: $fullCaption) {
            NavigationStack {
                ScrollView { Text(post.caption).frame(maxWidth: .infinity, alignment: .leading).padding() }
                    .navigationTitle("Caption").navigationBarTitleDisplayMode(.inline)
                    .toolbar { Button("Done") { fullCaption = false } }
            }.presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $comments) { NavigationStack { CommentsScreen(post: post, model: model, changed: changed) } }
        .confirmationDialog("Delete this post and its comments?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Delete post", role: .destructive) { mutate("delete") }
        }
    }
    private func like(doubleTap: Bool) {
        guard !busy else { return }
        if post.liked == 0 || doubleTap {
            pulse += 1; withAnimation(reduced ? nil : .spring(duration: 0.35, bounce: 0.45)) { showHeart = true }
        }
        if post.liked == 0 { mutate("like") } else if !doubleTap { mutate("unlike") }
    }
    private func mutate(_ action: String) {
        guard !busy else { return }; busy = true; error = nil
        Task {
            defer { busy = false }
            do { try await model.service.write(["action":action,"id":post.id]); await model.load(); await changed() }
            catch { self.error = error.localizedDescription; showHeart = false }
        }
    }
}

struct CommentsScreen: View {
    let post: BlubPost
    let model: AppModel
    let changed: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var deleting: Comment?
    @State private var rows = [Comment]()
    @State private var draft = ""
    @State private var key = UUID().uuidString
    @State private var more = false
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        List {
            if more { Button("Earlier comments") { Task { await page(older: true) } } }
            ForEach(rows) { row in VStack(alignment: .leading) { Text("@"+row.handle).font(.caption.bold()); Text(row.body)
                if row.author == model.data?.me?.id { Button("Delete",role:.destructive) { deleting=row }.font(.caption) }
            } }
            if rows.isEmpty && !busy && error == nil { Text("No comments yet.").foregroundStyle(.secondary) }
            if let error { Text(error); Button("Reload comments") { Task { await page() } } }
        }.safeAreaInset(edge: .bottom) {
            HStack { TextField("Add a comment", text: $draft, axis: .vertical).textFieldStyle(.roundedBorder)
                Button("Send") { Task { await send() } }.disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || draft.utf16.count > 1000)
            }.padding().background(.bar)
        }.disabled(busy).navigationTitle("Comments")
        .toolbar { Button("Done") { dismiss() } }.task { await page() }
        .confirmationDialog("Delete your comment?",isPresented:Binding(get:{deleting != nil},set:{if !$0 {deleting=nil}}),titleVisibility:.visible,presenting:deleting) { row in
            Button("Delete comment",role:.destructive) { Task {
                busy=true
                do { try await model.service.write(["action":"deleteComment","id":post.id,"commentId":String(row.id)]);await model.load();await changed();await page() }
                catch { self.error=error.localizedDescription;busy=false }
            } }
        }
        .onChange(of: draft) { key = UUID().uuidString }
    }
    private func page(older: Bool = false) async {
        busy = true; defer { busy = false }
        var q = ["action":"comments","id":post.id]
        if older, let first = rows.first { q["before"] = String(first.id) }
        do { let page: CommentPage = try await model.service.read(q); rows = page.comments + (older ? rows : []); more = page.more; error = nil }
        catch { self.error = error.localizedDescription }
    }
    private func send() async {
        guard !busy else { return }; busy = true
        do {
            try await model.service.write(["action":"comment","id":post.id,"body":draft,"requestId":key])
            draft = ""; await model.load(); await changed(); await page()
        } catch { self.error = error.localizedDescription; busy = false }
    }
}
