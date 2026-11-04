import SwiftUI

/// Shows the frozen photo. Tap an object to lift it out, then "Use this".
struct ChooseObjectScreen: View {
    let analysis: PhotoAnalysis
    let onRetake: () -> Void
    let onUse: (CGImage) -> Void

    @State private var selected: Int?
    @State private var lifted: CGImage?

    var body: some View {
        ZStack {
            GeometryReader { geometry in
                PhotoView(image: analysis.photo, size: geometry.size)
                    .overlay {
                        if let lifted {
                            Color.black.opacity(0.62)
                            PhotoView(image: lifted, size: geometry.size)
                                .shadow(color: .white.opacity(0.5), radius: 18)
                        }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { location in
                        select(at: location, in: geometry.size)
                    }
            }
            .ignoresSafeArea()

            VStack {
                HStack {
                    RoundButton(symbol: "xmark", label: "Retake", action: onRetake)
                    Spacer()
                }
                .padding(.horizontal, 24)

                Spacer()

                if lifted == nil {
                    Hint(text: "Tap the object you want").padding(.bottom, 16)
                } else {
                    if analysis.objects.count > 1 {
                        Hint(text: "Tap another object to change").padding(.bottom, 12)
                    }
                    PrimaryButton(title: "Use this", action: use)
                }
            }
            .padding(.bottom, 16)
        }
        .onAppear {
            // Only one object: no need to ask.
            if analysis.objects.count == 1, let only = analysis.objects.first {
                choose(only)
            }
        }
    }

    private func select(at location: CGPoint, in size: CGSize) {
        let point = PhotoView.normalized(location, image: analysis.photo, size: size)
        if let object = analysis.object(at: point) {
            choose(object)
        }
    }

    private func choose(_ object: Int) {
        guard object != selected, let cutout = try? analysis.cutout(object, cropped: false) else { return }
        selected = object
        withAnimation(.easeOut(duration: 0.2)) { lifted = cutout }
    }

    private func use() {
        guard let selected, let sticker = try? analysis.cutout(selected, cropped: true) else { return }
        onUse(sticker)
    }
}

/// Draws a photo filling the screen, the same way the camera preview does.
private struct PhotoView: View {
    let image: CGImage
    let size: CGSize

    var body: some View {
        Image(decorative: image, scale: 1)
            .resizable()
            .scaledToFill()
            .frame(width: size.width, height: size.height)
            .clipped()
    }

    /// Turns a position on screen into (0...1, 0...1) on the photo.
    static func normalized(_ location: CGPoint, image: CGImage, size: CGSize) -> CGPoint {
        let imageWidth = CGFloat(image.width)
        let imageHeight = CGFloat(image.height)
        let scale = max(size.width / imageWidth, size.height / imageHeight)
        let x = (location.x - (size.width - imageWidth * scale) / 2) / (imageWidth * scale)
        let y = (location.y - (size.height - imageHeight * scale) / 2) / (imageHeight * scale)
        return CGPoint(x: min(max(x, 0), 1), y: min(max(y, 0), 1))
    }
}
