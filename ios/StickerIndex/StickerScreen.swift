import SwiftUI

/// The finished sticker, ready to save.
struct StickerScreen: View {
    let sticker: CGImage
    let takenAt: Date
    let hasPlace: Bool
    let isSaving: Bool
    let wasRefused: Bool
    let onDiscard: () -> Void
    let onSave: () -> Void

    var body: some View {
        ZStack {
            Color.canvas.ignoresSafeArea()

            VStack(spacing: 16) {
                HStack {
                    RoundButton(symbol: "xmark", label: "Discard", action: onDiscard)
                        .disabled(isSaving)
                        .opacity(isSaving ? 0.4 : 1)
                    Spacer()
                }
                .padding(.horizontal, 24)

                Spacer()

                Image(decorative: sticker, scale: 1)
                    .resizable()
                    .scaledToFit()
                    .padding(.horizontal, 48)
                    .frame(maxHeight: 440)

                Label {
                    Text(takenAt, format: .dateTime.day().month().year())
                } icon: {
                    if hasPlace {
                        Image(systemName: "location.fill")
                    }
                }
                .font(.footnote)
                .foregroundStyle(.secondary)

                Spacer()

                if wasRefused {
                    Label("Sticker Index couldn’t accept this sticker.", systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.red)
                }

                PrimaryButton(title: isSaving ? "Saving…" : "Save", action: onSave)
                    .opacity(isSaving ? 0.55 : 1)
                    .disabled(isSaving)
            }
            .padding(.bottom, 16)
        }
    }
}
