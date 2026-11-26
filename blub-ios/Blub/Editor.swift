import SwiftUI
import PhotosUI
import ImageIO

struct Editor: View {
    enum Mode { case profile(FeedResponse.Profile?), post, highlight(HighlightSlot) }
    let model: AppModel
    let mode: Mode
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var handle = ""
    @State private var bio = ""
    @State private var caption = ""
    @State private var selection: PhotosPickerItem?
    @State private var image: Data?
    @State private var working = false
    @State private var preparing = false
    @State private var error: String?
    init(model: AppModel, mode: Mode) {
        self.model = model; self.mode = mode
        if case .profile(let p) = mode {
            _name = State(initialValue: p?.name ?? ""); _handle = State(initialValue: p?.handle ?? ""); _bio = State(initialValue: p?.bio ?? "")
        }
    }
    private var slot: HighlightSlot? { if case .highlight(let slot) = mode { return slot }; return nil }
    private var isProfile: Bool { if case .profile = mode { return true }; return false }
    private var onboarding: Bool { if case .profile(nil) = mode { return true }; return false }
    var body: some View {
        Form {
            if let slot { Text(slot.prompt).font(.headline) }
            Section {
                if let image, let preview = UIImage(data: image) {
                    Image(uiImage: preview).resizable().scaledToFit().frame(maxHeight: 220)
                }
                PhotosPicker(selection: $selection, matching: .images) {
                    Label(isProfile ? "Choose profile picture" : "Choose photo", systemImage: "photo")
                }
            }
            if isProfile {
                TextField("Name", text: $name).textContentType(.name)
                TextField("Handle", text: $handle).textInputAutocapitalization(.never).autocorrectionDisabled()
                TextField("Bio (optional)", text: $bio, axis: .vertical)
            } else if slot == nil { TextField("Caption (optional)", text: $caption, axis: .vertical) }
            if let error { Text(error).foregroundStyle(.pink) }
            Button(isProfile ? "Save profile" : slot != nil ? "Save answer" : "Share with friends") { Task { await save() } }
                .disabled(working || preparing || (isProfile ? name.isEmpty || handle.isEmpty : image == nil))
            if working || preparing { ProgressView() }
        }.disabled(working).navigationTitle(onboarding ? "Create your profile" : isProfile ? "Edit profile" : slot != nil ? "Photo answer" : "Post a photo")
        .toolbar { if !onboarding { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(working) } } }
        .interactiveDismissDisabled(working)
        .task(id: selection) {
            guard let selection else { return }
            preparing = true; image = nil; error = nil
            do {
                guard let data = try await selection.loadTransferable(type: Data.self),
                      let source = CGImageSourceCreateWithData(data as CFData, nil),
                      let thumb = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                        kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true,
                        kCGImageSourceThumbnailMaxPixelSize: isProfile ? 512 : 2400] as CFDictionary)
                else { throw BlubError.message("Choose a readable photo.") }
                let picked: CGImage
                if isProfile {
                    let side = min(thumb.width, thumb.height)
                    picked = thumb.cropping(to: CGRect(x: (thumb.width-side)/2, y: (thumb.height-side)/2, width: side, height: side)) ?? thumb
                } else { picked = thumb }
                guard let jpeg = UIImage(cgImage: picked).jpegData(compressionQuality: 0.85) else { throw BlubError.invalid }
                try Task.checkCancellation()
                image = jpeg
            } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
            if !Task.isCancelled { preparing = false }
        }
    }
    private func save() async {
        guard !working else { return }; working = true; defer { working = false }
        do {
            var fields = isProfile ? ["action":"profile","name":name,"handle":handle,"bio":bio] : ["caption":caption]
            if let slot { fields = ["action":"highlight","slot":slot.id] }
            try await model.service.write(fields, image: image, field: isProfile ? "avatar" : "photo")
            if !onboarding { dismiss() }
            await model.load()
        } catch { self.error = error.localizedDescription }
    }
}
