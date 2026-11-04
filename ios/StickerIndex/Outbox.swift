// Stickers that couldn't be uploaded wait here, in the app's private folder.
// Not in Photos, not in iCloud backups, and deleted as soon as they're uploaded.
import Foundation

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
        let details = try JSONEncoder().encode(upload)
        try details.write(to: detailsURL(upload.id), options: [.atomic, .completeFileProtection])
    }

    /// Tries everything waiting. A failure leaves the sticker here for next time.
    func send(token: String) async throws {
        guard !isSending else { return }
        isSending = true
        defer { isSending = false }

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
            try? FileManager.default.removeItem(at: file)
            try? FileManager.default.removeItem(at: pngURL(upload.id))
        }
    }

    private func waiting() -> [URL] {
        let files = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? []
        return files.filter { $0.pathExtension == "json" }
    }

    private func pngURL(_ id: String) -> URL { folder.appendingPathComponent("\(id).png") }
    private func detailsURL(_ id: String) -> URL { folder.appendingPathComponent("\(id).json") }
}
