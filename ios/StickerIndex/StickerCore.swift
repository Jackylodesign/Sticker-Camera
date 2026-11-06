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
        let buffer = try observation.generateScaledMaskForImage(forInstances: IndexSet(integer: object), from: handler)
        // No colour space: these numbers are how solid each pixel is, not colours.
        let mask = CIImage(cvPixelBuffer: buffer, options: [.colorSpace: NSNull()])
        guard let bounds = bounds(of: object, in: mask.extent) else { throw StickerError.renderFailed }

        let smooth = StickerStyle.smoothed(mask, objectSize: max(bounds.width, bounds.height))
        let image = CIImage(cgImage: photo).applyingFilter("CIBlendWithMask", parameters: [
            kCIInputMaskImageKey: smooth,
            kCIInputBackgroundImageKey: CIImage.empty(),
        ])
        guard let result = StickerStyle.context.createCGImage(image, from: cropped ? bounds : mask.extent) else {
            throw StickerError.renderFailed
        }
        return result
    }

    /// The box around one object, in Core Image's coordinates (origin bottom left).
    private func bounds(of object: Int, in extent: CGRect) -> CGRect? {
        let mask = observation.instanceMask
        CVPixelBufferLockBaseAddress(mask, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(mask, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(mask) else { return nil }
        let width = CVPixelBufferGetWidth(mask)
        let height = CVPixelBufferGetHeight(mask)
        let rowBytes = CVPixelBufferGetBytesPerRow(mask)
        let pixels = base.assumingMemoryBound(to: UInt8.self)

        var minX = width, minY = height, maxX = -1, maxY = -1
        for y in 0..<height {
            for x in 0..<width where Int(pixels[y * rowBytes + x]) == object {
                minX = min(minX, x)
                maxX = max(maxX, x)
                minY = min(minY, y)
                maxY = max(maxY, y)
            }
        }
        guard maxX >= 0 else { return nil }

        // One extra mask pixel each way, so the edge's soft ramp isn't cut off.
        let scaleX = extent.width / CGFloat(width)
        let scaleY = extent.height / CGFloat(height)
        let box = CGRect(
            x: CGFloat(minX - 1) * scaleX,
            y: CGFloat(height - maxY - 2) * scaleY,
            width: CGFloat(maxX - minX + 3) * scaleX,
            height: CGFloat(maxY - minY + 3) * scaleY
        )
        return box.intersection(extent).integral
    }
}

enum StickerError: Error {
    case renderFailed
}

enum StickerStyle {
    static let context = CIContext()
    /// Same as STYLE.border.width on the website: a fraction of the longer side.
    private static let borderWidth = 0.03
    /// How much the outline is evened out: a fraction of the object's longer
    /// side. Higher is smoother, but thin parts and small details start to go.
    private static let edgeSmoothing = 0.008

    /// Evens out a bumpy outline: blurs the mask, then sharpens it back at the
    /// halfway point. Small bumps melt away and the edge becomes one clean line.
    static func smoothed(_ mask: CIImage, objectSize: CGFloat) -> CIImage {
        let sigma = max(1, objectSize * edgeSmoothing)
        // Clamped, so an object touching the photo's edge doesn't fade out there.
        let blurred = mask.clampedToExtent().applyingGaussianBlur(sigma: sigma).cropped(to: mask.extent)

        // The steepness that leaves a soft ramp of 2-3 pixels, so it isn't jagged.
        let steepness = sigma
        let offset = 0.5 - 0.5 * steepness
        let sharpen = CIFilter.colorMatrix()
        sharpen.inputImage = blurred
        sharpen.rVector = CIVector(x: steepness, y: 0, z: 0, w: 0)
        sharpen.gVector = CIVector(x: steepness, y: 0, z: 0, w: 0)
        sharpen.bVector = CIVector(x: steepness, y: 0, z: 0, w: 0)
        sharpen.biasVector = CIVector(x: offset, y: offset, z: offset, w: 1)

        let clamp = CIFilter.colorClamp()
        clamp.inputImage = sharpen.outputImage
        clamp.minComponents = CIVector(x: 0, y: 0, z: 0, w: 0)
        clamp.maxComponents = CIVector(x: 1, y: 1, z: 1, w: 1)
        return clamp.outputImage ?? mask
    }

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

    /// The clean sticker as a PNG, shrunk if needed to fit the upload limit
    /// (MAX_UPLOAD_BYTES on the website).
    static func png(_ cutout: CGImage) -> Data? {
        let limit = 4 * 1024 * 1024
        var image = CIImage(cgImage: cutout)
        let space = CGColorSpace(name: CGColorSpace.sRGB)!
        for _ in 0..<8 {
            guard let data = context.pngRepresentation(of: image, format: .RGBA8, colorSpace: space) else { return nil }
            if data.count <= limit { return data }
            image = image.transformed(by: CGAffineTransform(scaleX: 0.8, y: 0.8))
            image = image.transformed(by: CGAffineTransform(translationX: -image.extent.minX, y: -image.extent.minY))
        }
        return nil
    }
}
