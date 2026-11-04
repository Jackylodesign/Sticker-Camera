import SwiftUI

/// The finished sticker. Saving arrives in the next step of the plan.
struct StickerScreen: View {
    let sticker: CGImage
    let onClose: () -> Void

    var body: some View {
        ZStack {
            Color.canvas.ignoresSafeArea()

            VStack(spacing: 16) {
                HStack {
                    RoundButton(symbol: "xmark", label: "Discard", action: onClose)
                    Spacer()
                }
                .padding(.horizontal, 24)

                Spacer()

                Image(decorative: sticker, scale: 1)
                    .resizable()
                    .scaledToFit()
                    .padding(.horizontal, 48)
                    .frame(maxHeight: 440)

                Text(Date.now, format: .dateTime.day().month().year())
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                Spacer()

                Text("Saving comes in the next step.")
                    .font(.footnote)
                    .foregroundStyle(.tertiary)
                PrimaryButton(title: "Done", action: onClose)
            }
            .padding(.bottom, 16)
        }
    }
}
