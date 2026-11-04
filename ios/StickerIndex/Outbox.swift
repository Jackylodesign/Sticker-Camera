// Stickers that couldn't be uploaded wait here, in the app's private folder.
// Not in Photos, not in iCloud backups, and deleted as soon as they're uploaded.
import Foundation

struct WaitingSticker: Identifiable, Sendable {
    let id: String
    let png: Data
}

actor Outbox {
    static let shared = Outbox()

    private let folder: URL
    private var isSending = false

    private init() {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        folder = support.appendingPathComponent("Outbox", isDirectory: true)
    }

    func add(_ upload: Upload, png: Data) throws {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var excluded = folder
        try excluded.setResourceValues(values)

        // The sticker first: a details file with no sticker would never finish.
        try png.write(to: pngURL(upload.id), options: [.atomic, .completeFileProtection])
        do {
            let details = try JSONEncoder().encode(upload)
            try details.write(to: detailsURL(upload.id), options: [.atomic, .completeFileProtection])
        } catch {
            remove(upload.id)
            throw error
        }
    }

    var hasWaiting: Bool { !waiting().isEmpty }

    /// Gives up on a sticker that's waiting. It can't be recovered.
    func discard(_ id: String) {
        remove(id)
    }

    /// Tries everything waiting. A failure leaves the sticker here for next time.
    func send(token: String) async throws {
        guard !isSending else { return }
        isSending = true
        defer { isSending = false }

        removeHalves()
        for file in waiting() {
            guard let details = try? Data(contentsOf: file),
                  let upload = try? JSONDecoder().decode(Upload.self, from: details),
                  let png = try? Data(contentsOf: pngURL(upload.id))
            else { continue }
            do {
                try await API.upload(upload, png: png, token: token)
            } catch APIError.rejected {
                continue // this one won't work, but the others might
            }
            remove(upload.id)
        }
    }

    /// The stickers still waiting, for showing in the Library.
    func waitingStickers() -> [WaitingSticker] {
        waiting().compactMap { file in
            let id = file.deletingPathExtension().lastPathComponent
            guard let png = try? Data(contentsOf: pngURL(id)) else { return nil }
            return WaitingSticker(id: id, png: png)
        }
    }

    private func remove(_ id: String) {
        try? FileManager.default.removeItem(at: pngURL(id))
        try? FileManager.default.removeItem(at: detailsURL(id))
    }

    /// A crash can leave a sticker with no details, or details with no sticker.
    /// Neither can ever be sent, so they shouldn't stay on the phone.
    private func removeHalves() {
        let files = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? []
        let names = Set(files.map(\.lastPathComponent))
        for file in files {
            let id = file.deletingPathExtension().lastPathComponent
            let partner = file.pathExtension == "png" ? "\(id).json" : "\(id).png"
            if !names.contains(partner) {
                try? FileManager.default.removeItem(at: file)
            }
        }
    }

    private func waiting() -> [URL] {
        let files = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? []
        return files.filter { $0.pathExtension == "json" }
    }

    private func pngURL(_ id: String) -> URL { folder.appendingPathComponent("\(id).png") }
    private func detailsURL(_ id: String) -> URL { folder.appendingPathComponent("\(id).json") }
}
