import Network
import SwiftUI

/// Setup (once) → camera → choose the object → sticker → save → back to the camera.
struct ContentView: View {
    private enum Step {
        case camera
        case analyzing(CGImage)
        case choosing(PhotoAnalysis)
        case noObject
        case failed
        case sticker(display: CGImage, clean: CGImage, takenAt: Date)
    }

    @StateObject private var camera = CameraModel()
    @StateObject private var location = Location()
    @State private var token = TokenStore.load()
    @State private var tokenWasRefused = false
    @State private var step = Step.camera
    @State private var isSaving = false
    @State private var toast: Toast?
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if token == nil {
                SetupScreen(startWithBadToken: tokenWasRefused) { connected in
                    token = connected
                    tokenWasRefused = false
                    sendWaiting()
                }
            } else {
                flow
                    .task(id: isOnCamera) {
                        if isOnCamera {
                            location.refresh()
                            await camera.start()
                        } else {
                            camera.stop()
                        }
                    }
                    .overlay(alignment: .bottom) {
                        if let toast, isOnCamera {
                            Hint(text: toast.message, symbol: toast.symbol)
                                .padding(.bottom, 120)
                                .transition(.opacity)
                        }
                    }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { sendWaiting() }
            guard isOnCamera, token != nil else { return }
            if phase == .active {
                Task { await camera.start() }
            } else if phase == .background {
                camera.stop()
            }
        }
        .task { await watchNetwork() }
    }

    @ViewBuilder private var flow: some View {
        switch step {
        case .camera:
            CameraScreen(camera: camera) { photo in
                location.refresh()
                if let image = upright(photo) {
                    analyze(image)
                } else {
                    step = .failed
                }
            }
        case .analyzing(let photo):
            ZStack {
                Image(decorative: photo, scale: 1)
                    .resizable()
                    .scaledToFill()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipped()
                    .ignoresSafeArea()
                VStack {
                    Spacer()
                    Hint(text: "Finding objects…", busy: true).padding(.bottom, 32)
                }
            }
        case .choosing(let analysis):
            ChooseObjectScreen(analysis: analysis, onRetake: backToCamera) { cutout in
                let display = (try? StickerStyle.withBorder(cutout)) ?? cutout
                step = .sticker(display: display, clean: cutout, takenAt: .now)
            }
        case .noObject:
            MessageScreen(
                symbol: "viewfinder",
                title: "No object found",
                message: "Move closer, and try a plainer background.",
                buttonTitle: "Retake",
                action: backToCamera
            )
        case .failed:
            MessageScreen(
                symbol: "exclamationmark.triangle.fill",
                title: "Couldn’t read the photo",
                message: "Something went wrong. Please try again.",
                buttonTitle: "Retake",
                action: backToCamera
            )
        case .sticker(let display, let clean, let takenAt):
            StickerScreen(
                sticker: display,
                takenAt: takenAt,
                hasPlace: location.current != nil,
                isSaving: isSaving,
                onDiscard: backToCamera
            ) {
                save(clean, takenAt: takenAt)
            }
        }
    }

    private var isOnCamera: Bool {
        if case .camera = step { return true }
        return false
    }

    private func backToCamera() {
        step = .camera
    }

    private func analyze(_ photo: CGImage) {
        step = .analyzing(photo)
        Task.detached(priority: .userInitiated) {
            let next: Step
            do {
                if let analysis = try PhotoAnalysis.analyze(photo) {
                    next = .choosing(analysis)
                } else {
                    next = .noObject
                }
            } catch {
                next = .failed
            }
            await MainActor.run { step = next }
        }
    }

    /// Uploads straight from memory. Only if that fails does it touch the disk.
    private func save(_ clean: CGImage, takenAt: Date) {
        guard let token else { return }
        isSaving = true
        let place = location.current?.coordinate
        let upload = Upload(
            id: UUID().uuidString.lowercased(),
            takenAt: takenAt,
            latitude: place?.latitude,
            longitude: place?.longitude
        )
        Task {
            defer { isSaving = false }
            guard let png = await Task.detached(operation: { StickerStyle.png(clean) }).value else {
                show(Toast(symbol: "exclamationmark.triangle.fill", message: "Couldn’t save this sticker"))
                backToCamera()
                return
            }
            do {
                try await API.upload(upload, png: png, token: token)
                show(Toast(symbol: "checkmark", message: "Saved to Library"))
                sendWaiting()
            } catch {
                let isBadToken = (error as? APIError) == .badToken
                do {
                    try await Outbox.shared.add(upload, png: png)
                    show(Toast(symbol: "wifi.slash", message: isBadToken ? "Saved for now. Reconnect to upload." : "Will upload when you’re back online"))
                } catch {
                    show(Toast(symbol: "exclamationmark.triangle.fill", message: "Couldn’t save this sticker"))
                }
                if isBadToken { forgetToken() }
            }
            backToCamera()
        }
    }

    private func sendWaiting() {
        guard let token else { return }
        Task {
            do {
                try await Outbox.shared.send(token: token)
            } catch APIError.badToken {
                forgetToken()
            } catch {
                // Still offline. The next launch or reconnect tries again.
            }
        }
    }

    private func forgetToken() {
        TokenStore.clear()
        tokenWasRefused = true
        token = nil
    }

    private func show(_ message: Toast) {
        withAnimation { toast = message }
        Task {
            try? await Task.sleep(for: .seconds(3))
            withAnimation { if toast == message { toast = nil } }
        }
    }

    /// Sends waiting stickers as soon as the connection comes back.
    private func watchNetwork() async {
        let monitor = NWPathMonitor()
        let paths = AsyncStream<NWPath> { continuation in
            monitor.pathUpdateHandler = { continuation.yield($0) }
            continuation.onTermination = { _ in monitor.cancel() }
            monitor.start(queue: DispatchQueue(label: "network"))
        }
        for await path in paths where path.status == .satisfied {
            sendWaiting()
        }
    }

    /// Turns the photo the right way up and shrinks it to a sensible size.
    private func upright(_ photo: UIImage) -> CGImage? {
        let longest: CGFloat = 2048
        let scale = min(1, longest / max(photo.size.width, photo.size.height))
        let size = CGSize(width: photo.size.width * scale, height: photo.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            photo.draw(in: CGRect(origin: .zero, size: size))
        }.cgImage
    }
}

private struct Toast: Equatable {
    let symbol: String
    let message: String
}

#Preview {
    ContentView()
}
