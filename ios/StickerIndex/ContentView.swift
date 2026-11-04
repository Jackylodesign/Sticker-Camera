import SwiftUI

/// Camera → choose the object → sticker → back to the camera.
struct ContentView: View {
    private enum Step {
        case camera
        case analyzing(CGImage)
        case choosing(PhotoAnalysis)
        case noObject
        case failed
        case sticker(CGImage)
    }

    @StateObject private var camera = CameraModel()
    @State private var step = Step.camera
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            switch step {
            case .camera:
                CameraScreen(camera: camera) { photo in
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
                    step = .sticker((try? StickerStyle.withBorder(cutout)) ?? cutout)
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
            case .sticker(let sticker):
                StickerScreen(sticker: sticker, onClose: backToCamera)
            }
        }
        .task(id: isOnCamera) {
            if isOnCamera {
                await camera.start()
            } else {
                camera.stop()
            }
        }
        .onChange(of: scenePhase) { _, phase in
            guard isOnCamera else { return }
            if phase == .active {
                Task { await camera.start() }
            } else if phase == .background {
                camera.stop()
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

#Preview {
    ContentView()
}
