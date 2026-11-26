import SwiftUI

struct HighlightSlot: Decodable, Identifiable {
    let id, prompt: String
    let photo: String?
}

struct HighlightsView: View {
    let model: AppModel
    let owner: String
    let editable: Bool
    @State private var slots = [HighlightSlot]()
    @State private var editing: HighlightSlot?
    @State private var removing: HighlightSlot?
    @State private var error: String?

    @State private var playing = false
    @State private var manage = false
    private var answers: [HighlightSlot] { slots.filter { $0.photo != nil } }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !slots.isEmpty { Text("Highlights").font(.headline) }
            if let cover = answers.first?.photo {
                Button { playing = true } label: {
                    HStack(spacing: 16) {
                        PrivatePhoto(id: cover, service: model.service, highlight: true, thumbnail: true)
                            .frame(width: 78, height: 88).clipped().cornerRadius(10)
                        VStack(alignment: .leading) {
                            Label("Play highlights", systemImage: "play.fill").font(.headline)
                            Text(answers.count == 1 ? "1 photo" : "\(answers.count) photos").font(.caption)
                        }
                        Spacer()
                    }.padding().chromeCard()
                }.buttonStyle(.plain)
                if editable { Button(manage ? "Done editing" : "Edit highlights") { manage.toggle() } }
            }
            if editable && (manage || answers.isEmpty) {
            ForEach(slots) { slot in
                VStack(alignment: .leading, spacing: 10) {
                    Text(slot.prompt).font(.headline)
                    if let photo = slot.photo {
                        PrivatePhoto(id: photo, service: model.service, highlight: true)
                            .frame(maxWidth: .infinity, maxHeight: 320)
                            .accessibilityLabel("Photo answer to " + slot.prompt)
                    }
                    if editable {
                        HStack {
                            Button(slot.photo == nil ? "Add photo" : "Change photo") { editing = slot }
                            if slot.photo != nil {
                                Spacer()
                                Button("Remove", role: .destructive) { removing = slot }
                            }
                        }.font(.subheadline)
                    }
                }.frame(maxWidth: .infinity, alignment: .leading).padding().chromeCard()
            }
            }
            if let error { Text(error); Button("Retry") { Task { await load() } } }
        }.task(id: owner) { await load() }
        .fullScreenCover(isPresented: $playing) {
            HighlightReel(answers: answers, model: model)
        }
        .sheet(item: $editing, onDismiss: { Task { await load() } }) { slot in
            NavigationStack { Editor(model: model, mode: .highlight(slot)) }
        }
        .confirmationDialog("Remove this photo answer?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }), presenting: removing) { slot in
            Button("Remove", role: .destructive) { Task {
                guard let photo = slot.photo else { return }
                do { try await model.service.write(["action":"removeHighlight","id":photo]); await load() }
                catch { self.error = error.localizedDescription }
            } }
        }
    }

    private func load() async {
        do {
            let rows: [HighlightSlot] = try await model.service.read(["action":"highlights","id":owner])
            slots = rows.filter { editable || $0.photo != nil }
            error = nil
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}

private struct HighlightReel: View {
    let answers: [HighlightSlot]
    let model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scene
    @State private var index = 0
    @State private var paused = false
    @State private var loaded: String?

    var body: some View {
        if answers.indices.contains(index), let photo = answers[index].photo {
            VStack(alignment: .leading, spacing: 20) {
                HStack(spacing: 5) {
                    ForEach(answers.indices, id: \.self) { i in
                        Capsule().fill(i <= index ? Color.white : Color.white.opacity(0.25)).frame(height: 4)
                    }
                }.accessibilityHidden(true)
                HStack {
                    Text("Highlights · \(index + 1) of \(answers.count)").font(.subheadline.bold())
                    Spacer()
                    Button("Close") { dismiss() }
                }
                Text(answers[index].prompt).font(.largeTitle.bold()).accessibilityAddTraits(.isHeader)
                PrivatePhoto(id: photo, service: model.service, highlight: true, onLoaded: { loaded = photo })
                    .id(photo).frame(maxWidth: .infinity, maxHeight: .infinity)
                    .accessibilityLabel("Photo answer")
                HStack {
                    Button("Back") { index -= 1 }.disabled(index == 0)
                    Spacer()
                    if index < answers.count - 1 {
                        Button(paused ? "Play" : "Pause") { paused.toggle() }
                    }
                    Spacer()
                    Button(index == answers.count - 1 ? "Done" : "Next") {
                        if index == answers.count - 1 { dismiss() } else { index += 1 }
                    }
                }.buttonStyle(.bordered)
            }.padding(22).foregroundStyle(.white).tint(.white)
            .background(LinearGradient(colors: [Color.indigo.opacity(0.48), .black, Color.purple.opacity(0.32)], startPoint: .topLeading, endPoint: .bottomTrailing).ignoresSafeArea().background(.black))
            .onAppear { if reduceMotion { paused = true } }
            .task(id: "\(index)-\(loaded ?? "")-\(paused)-\(scene)") {
                guard !paused, scene == .active, loaded == photo, index < answers.count - 1 else { return }
                do { try await Task.sleep(for: .seconds(7)); index += 1 } catch {}
            }
        }
    }
}
