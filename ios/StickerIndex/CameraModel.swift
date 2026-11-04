// The live camera. Photos only ever live in memory: this app has no access to
// the photo library and never writes a photo to disk.
@preconcurrency import AVFoundation
import UIKit

@MainActor
final class CameraModel: ObservableObject {
    enum Access { case checking, allowed, denied, unavailable }

    @Published private(set) var access = Access.checking
    @Published var flashOn = false

    let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
    private let queue = DispatchQueue(label: "camera")
    private var isConfigured = false
    private var pending: PhotoCapture?

    func start() async {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            break
        case .notDetermined:
            guard await AVCaptureDevice.requestAccess(for: .video) else {
                access = .denied
                return
            }
        default:
            access = .denied
            return
        }

        if !isConfigured {
            guard configure() else {
                access = .unavailable
                return
            }
            isConfigured = true
        }
        access = .allowed
        let session = session
        queue.async { session.startRunning() }
    }

    func stop() {
        let session = session
        queue.async { session.stopRunning() }
    }

    func capture() async throws -> UIImage {
        let settings = AVCapturePhotoSettings()
        if output.supportedFlashModes.contains(.on), flashOn {
            settings.flashMode = .on
        }
        return try await withCheckedThrowingContinuation { continuation in
            let capture = PhotoCapture { [weak self] result in
                Task { @MainActor in self?.pending = nil }
                continuation.resume(with: result)
            }
            pending = capture
            output.capturePhoto(with: settings, delegate: capture)
        }
    }

    private func configure() -> Bool {
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: camera)
        else { return false }

        session.beginConfiguration()
        defer { session.commitConfiguration() }
        session.sessionPreset = .photo
        guard session.canAddInput(input), session.canAddOutput(output) else { return false }
        session.addInput(input)
        session.addOutput(output)
        return true
    }
}

enum CameraError: Error {
    case noPhoto
}

private final class PhotoCapture: NSObject, AVCapturePhotoCaptureDelegate {
    private let done: (Result<UIImage, Error>) -> Void

    init(done: @escaping (Result<UIImage, Error>) -> Void) {
        self.done = done
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        if let error {
            done(.failure(error))
        } else if let data = photo.fileDataRepresentation(), let image = UIImage(data: data) {
            done(.success(image))
        } else {
            done(.failure(CameraError.noPhoto))
        }
    }
}
