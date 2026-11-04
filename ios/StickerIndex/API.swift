// Talks to stickerindex.page with the token. See app/api/stickers/route.ts.
import Foundation

/// One sticker on its way to the Library.
struct Upload: Codable, Sendable {
    let id: String
    let takenAt: Date
    let latitude: Double?
    let longitude: Double?
}

/// One sticker in the Library. No coordinates: the server doesn't send them.
struct StickerItem: Decodable, Identifiable, Sendable {
    let id: String
    let createdAt: Date
    let takenAt: Date?
    let placeName: String?
    let isPublic: Bool

    var date: Date { takenAt ?? createdAt }
}

enum APIError: Error {
    case badToken
    case offline
    case rejected
}

enum API {
    private static let stickers = URL(string: "https://stickerindex.page/api/stickers")!
    /// Ephemeral: responses are never cached on disk, so stickers stay off the phone.
    private static let session = URLSession(configuration: .ephemeral)

    /// Throws `badToken` if the server refuses the token, `offline` if it can't be reached.
    static func check(token: String) async throws {
        try await send(authorized(stickers, token: token))
    }

    static func stickers(token: String) async throws -> [StickerItem] {
        let data = try await send(authorized(stickers, token: token))
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            if let date = try? Date(text, strategy: .iso8601) { return date }
            return try Date(text, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true))
        }
        return try decoder.decode([StickerItem].self, from: data)
    }

    static func image(id: String, thumbnail: Bool, token: String) async throws -> Data {
        var url = stickers.appendingPathComponent(id).appendingPathComponent("image")
        if thumbnail { url.append(queryItems: [URLQueryItem(name: "size", value: "thumb")]) }
        return try await send(authorized(url, token: token))
    }

    static func delete(id: String, token: String) async throws {
        var request = authorized(stickers.appendingPathComponent(id), token: token)
        request.httpMethod = "DELETE"
        try await send(request)
    }

    /// Safe to repeat: the id stops a retry from making a duplicate.
    static func upload(_ upload: Upload, png: Data, token: String) async throws {
        let boundary = "StickerIndex-\(UUID().uuidString)"
        var body = Data()
        func field(_ name: String, _ value: String) {
            body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".utf8))
        }
        field("id", upload.id)
        field("taken_at", upload.takenAt.ISO8601Format())
        if let latitude = upload.latitude, let longitude = upload.longitude {
            field("lat", String(latitude))
            field("lng", String(longitude))
        }
        body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"sticker.png\"\r\nContent-Type: image/png\r\n\r\n".utf8))
        body.append(png)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))

        var request = URLRequest(url: stickers)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 60
        request.httpBody = body
        try await send(request)
    }

    private static func authorized(_ url: URL, token: String) -> URLRequest {
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 20
        return request
    }

    @discardableResult
    private static func send(_ request: URLRequest) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.offline
        }
        switch (response as? HTTPURLResponse)?.statusCode {
        case .some(200..<300): return data
        case 401: throw APIError.badToken
        case .some(500...): throw APIError.offline // the server's fault: worth retrying
        default: throw APIError.rejected
        }
    }
}
