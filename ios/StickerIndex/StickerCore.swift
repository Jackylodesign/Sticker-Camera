// Finds objects in a photo, cuts one out and adds the white border. Everything
// happens in memory on the phone: nothing is uploaded or written to disk.
import CoreImage
import CoreImage.CIFilterBuiltins
import CoreVideo
import Vision

/// The objects Vision found in one photo.
final class PhotoAnalysis: @unchecked Sendable {
    let photo: CGImage
    private let handler: VNImageRequestHandler
    private let observation: VNInstanceMaskObservation

    private init(photo: CGImage, handler: VNImageRequestHandler, observation: VNInstanceMaskObservation) {
        self.photo = photo
        self.handler = handler
        self.observation = observation
    }

    /// Returns nil when no object is found. Slow: call it off the main thread.
    static func analyze(_ photo: CGImage) throws -> PhotoAnalysis? {
        let request = VNGenerateForegroundInstanceMaskRequest()
        let handler = VNImageRequestHandler(cgImage: photo)
        try handler.perform([request])
        guard let observation = request.results?.first, !observation.allInstances.isEmpty else { return nil }
        return PhotoAnalysis(photo: photo, handler: handler, observation: observation)
    }

    var objects: [Int] { Array(observation.allInstances) }

    /// The object at a point, from (0, 0) top left to (1, 1) bottom right. A tap
    /// just beside an object still counts, because fingers aren't precise.
    func object(at point: CGPoint) -> Int? {
        let mask = observation.instanceMask
        CVPixelBufferLockBaseAddress(mask, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(mask, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(mask) else { return nil }
        let width = CVPixelBufferGetWidth(mask)
        let height = CVPixelBufferGetHeight(mask)
        let rowBytes = CVPixelBufferGetBytesPerRow(mask)
        let pixels = base.assumingMemoryBound(to: UInt8.self)
        let centerX = Int(point.x * CGFloat(width))
        let centerY = Int(point.y * CGFloat(height))
        let reach = max(width, height) / 25

        var best: (label: Int, distance: Int)?
        for y in max(0, centerY - reach)...min(height - 1, max(0, centerY + reach)) {
            for x in max(0, centerX - reach)...min(width - 1, max(0, centerX + reach)) {
                let label = Int(pixels[y * rowBytes + x])
                guard label != 0 else { continue }
                let distance = (x - centerX) * (x - centerX) + (y - centerY) * (y - centerY)
                if distance < best?.distance ?? .max { best = (label, distance) }
            }
        }
        return best?.label
    }

    /// One object with a transparent background. `cropped: false` keeps the
    /// photo's size, so it lines up when drawn on top of the photo.
    func cutout(_ object: Int, cropped: Bool) throws -> CGImage {
        let buffer = try observation.generateMaskedImage(
            ofInstances: IndexSet(integer: object),
            from: handler,
            croppedToInstancesExtent: cropped
        )
        let image = CIImage(cvPixelBuffer: buffer)
        guard let result = StickerStyle.context.createCGImage(image, from: image.extent) else {
            throw StickerError.renderFailed
        }
        return result
    }
}

enum StickerError: Error {
    case renderFailed
}

enum StickerStyle {
    static let context = CIContext()
    /// Same as STYLE.border.width on the website: a fraction of the longer side.
    private static let borderWidth = 0.03

    /// Adds the white border. For showing only: the saved sticker stays clean.
    static func withBorder(_ cutout: CGImage) throws -> CGImage {
        let image = CIImage(cgImage: cutout)
        let radius = Float(Double(max(cutout.width, cutout.height)) * borderWidth)

        let grow = CIFilter.morphologyMaximum()
        grow.inputImage = image
        grow.radius = radius

        let white = CIFilter.colorMatrix()
        white.inputImage = grow.outputImage
        white.rVector = CIVector(x: 0, y: 0, z: 0, w: 0)
        white.gVector = CIVector(x: 0, y: 0, z: 0, w: 0)
        white.bVector = CIVector(x: 0, y: 0, z: 0, w: 0)
        white.biasVector = CIVector(x: 1, y: 1, z: 1, w: 0)

        guard let border = white.outputImage else { throw StickerError.renderFailed }
        // A little blur softens the stair-steps along the border's outer edge.
        let result = image.composited(over: border.applyingGaussianBlur(sigma: 1.2).cropped(to: border.extent))
        guard let output = context.createCGImage(result, from: result.extent.integral) else {
            throw StickerError.renderFailed
        }
        return output
    }
}
