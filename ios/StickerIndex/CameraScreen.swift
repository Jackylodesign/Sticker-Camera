import AVFoundation
import SwiftUI

struct CameraScreen: View {
    @ObservedObject var camera: CameraModel
    let latest: CGImage?
    let hasWaiting: Bool
    let onLibrary: () -> Void
    let onPhoto: (UIImage) -> Void

    @State private var isCapturing = false
    @State private var failed = false

    var body: some View {
        switch camera.access {
        case .checking:
            Color.canvas.ignoresSafeArea()
        case .denied:
            MessageScreen(
                symbol: "camera.fill",
                title: "Camera access is off",
                message: "Sticker Index needs the camera to take photos. Photos stay out of your photo library.",
                buttonTitle: "Open Settings"
            ) {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
        case .unavailable:
            MessageScreen(
                symbol: "camera.fill",
                title: "No camera",
                message: "This device has no camera. Try it on your iPhone."
            )
        case .allowed:
            cameraView
        }
    }

    private var cameraView: some View {
        ZStack {
            CameraPreview(session: camera.session).ignoresSafeArea()

            VStack {
                HStack {
                    RoundButton(
                        symbol: camera.flashOn ? "bolt.fill" : "bolt.slash.fill",
                        label: camera.flashOn ? "Turn flash off" : "Turn flash on"
                    ) {
                        camera.flashOn.toggle()
                    }
                    Spacer()
                }
                .padding(.horizontal, 24)

                Spacer()

                if failed {
                    Hint(text: "Couldn’t take the photo. Try again.")
                        .padding(.bottom, 16)
                }

                ZStack {
                    Button(action: takePhoto) {
                        ZStack {
                            Circle().strokeBorder(.white, lineWidth: 4)
                            Circle().fill(.white).padding(7)
                        }
                        .frame(width: 76, height: 76)
                    }
                    .disabled(isCapturing)
                    .accessibilityLabel("Take photo")

                    HStack {
                        Spacer()
                        libraryButton
                    }
                    .padding(.horizontal, 24)
                }
                .padding(.bottom, 16)
            }
        }
    }

    private var libraryButton: some View {
        Button(action: onLibrary) {
            Group {
                if let latest {
                    Image(decorative: latest, scale: 1)
                        .resizable()
                        .scaledToFit()
                        .padding(5)
                } else {
                    Image(systemName: "square.grid.2x2")
                        .font(.system(size: 20))
                        .foregroundStyle(.white)
                }
            }
            .frame(width: 52, height: 52)
            .background(Color(white: 0.12).opacity(0.75), in: RoundedRectangle(cornerRadius: 14))
            .overlay {
                RoundedRectangle(cornerRadius: 14).strokeBorder(.white.opacity(0.25))
            }
            .overlay(alignment: .topTrailing) {
                if hasWaiting {
                    WaitingBadge(size: 22).offset(x: 8, y: -8)
                }
            }
        }
        .accessibilityLabel(hasWaiting ? "Library, stickers waiting to upload" : "Library")
    }

    private func takePhoto() {
        isCapturing = true
        failed = false
        Task {
            defer { isCapturing = false }
            do {
                onPhoto(try await camera.capture())
            } catch {
                failed = true
            }
        }
    }
}

private struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {}

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }
}
