import SwiftUI

/// The stickers on the server, plus any still waiting on this phone.
@MainActor
final class LibraryModel: ObservableObject {
    enum Status { case loading, loaded, failed }

    @Published private(set) var items: [StickerItem] = []
    @Published private(set) var waiting: [WaitingSticker] = []
    @Published private(set) var status = Status.loading
    @Published private(set) var tokenRefused = false
    /// Shown beside the shutter.
    @Published var latest: CGImage?

    var token: String? {
        didSet { if token != nil { tokenRefused = false } }
    }

    // In memory only: gone when the app closes.
    private var thumbnails: [String: CGImage] = [:]

    func refresh() async {
        await refreshWaiting()
        guard let token else { return }
        do {
            items = try await API.stickers(token: token)
            status = .loaded
            if latest == nil, let first = items.first {
                latest = await thumbnail(for: first.id)
            }
        } catch APIError.badToken {
            tokenRefused = true
        } catch {
            status = .failed
        }
    }

    func refreshWaiting() async {
        waiting = await Outbox.shared.waitingStickers()
    }

    func thumbnail(for id: String) async -> CGImage? {
        if let saved = thumbnails[id] { return saved }
        guard let token, let data = try? await API.image(id: id, thumbnail: true, token: token) else { return nil }
        let image = UIImage(data: data)?.cgImage
        thumbnails[id] = image
        return image
    }

    func fullImage(for id: String) async -> CGImage? {
        guard let token, let data = try? await API.image(id: id, thumbnail: false, token: token) else { return nil }
        return UIImage(data: data)?.cgImage
    }

    func delete(_ item: StickerItem) async throws {
        guard let token else { return }
        try await API.delete(id: item.id, token: token)
        items.removeAll { $0.id == item.id }
        thumbnails[item.id] = nil
        latest = nil
        if let first = items.first {
            latest = await thumbnail(for: first.id)
        }
    }
}
