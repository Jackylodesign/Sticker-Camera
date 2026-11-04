import AVFoundation
import SwiftUI

struct CameraScreen: View {
    @ObservedObject var camera: CameraModel
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

                Button(action: takePhoto) {
                    ZStack {
                        Circle().strokeBorder(.white, lineWidth: 4)
                        Circle().fill(.white).padding(7)
                    }
                    .frame(width: 76, height: 76)
                }
                .disabled(isCapturing)
                .accessibilityLabel("Take photo")
                .padding(.bottom, 16)
            }
        }
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
