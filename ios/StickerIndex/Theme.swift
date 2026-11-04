import SwiftUI

extension Color {
    /// Same as the website's dark canvas.
    static let canvas = Color(red: 14 / 255, green: 14 / 255, blue: 14 / 255)
}

/// The main action on a screen: a white pill.
struct PrimaryButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.headline)
                .foregroundStyle(Color.canvas)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(.white, in: Capsule())
        }
        .padding(.horizontal, 24)
    }
}

/// A round button with an SF Symbol, over the photo or the canvas.
struct RoundButton: View {
    let symbol: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 19, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .modifier(RoundGlass())
        }
        .accessibilityLabel(label)
    }
}

private struct RoundGlass: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content.glassEffect(.regular.interactive(), in: Circle())
        } else {
            content.background(.ultraThinMaterial, in: Circle())
        }
    }
}

/// A small message floating over the photo.
struct Hint: View {
    let text: String
    var busy = false

    var body: some View {
        HStack(spacing: 10) {
            if busy {
                ProgressView().controlSize(.small)
            }
            Text(text).font(.subheadline)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color(white: 0.11).opacity(0.82), in: Capsule())
    }
}

/// A full-screen message with one action, such as "Camera access is off".
struct MessageScreen: View {
    let symbol: String
    let title: String
    let message: String
    var buttonTitle: String?
    var action: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Spacer()
            Image(systemName: symbol)
                .font(.system(size: 40))
                .foregroundStyle(.tertiary)
            Text(title).font(.title.bold())
            Text(message).foregroundStyle(.secondary)
            Spacer()
            if let buttonTitle {
                PrimaryButton(title: buttonTitle, action: action)
                    .padding(.horizontal, -24)
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.canvas)
    }
}
