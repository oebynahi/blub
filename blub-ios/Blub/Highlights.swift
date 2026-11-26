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

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !slots.isEmpty { Text("Highlights").font(.headline) }
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
            if let error { Text(error); Button("Retry") { Task { await load() } } }
        }.task(id: owner) { await load() }
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
