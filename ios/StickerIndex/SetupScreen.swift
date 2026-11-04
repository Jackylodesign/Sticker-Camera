import SwiftUI

/// Shown until a working token is saved. You only do this once.
struct SetupScreen: View {
    var startWithBadToken = false
    let onConnected: (String) -> Void

    private enum Problem {
        case badToken, offline, keychain
    }

    @State private var token = ""
    @State private var isChecking = false
    @State private var problem: Problem?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            LogoMark()
                .stroke(.white, style: StrokeStyle(lineWidth: 4.4, lineCap: .round, lineJoin: .round))
                .frame(width: 44, height: 44)
                .padding(.top, 72)
                .padding(.bottom, 8)
            Text("Connect your library").font(.title.bold())
            Text("On stickerindex.page/library, generate a token, then paste it here. You only do this once.")
                .foregroundStyle(.secondary)

            SecureField("Paste token", text: $token)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(.horizontal, 16)
                .frame(height: 52)
                .background(Color(white: 1, opacity: 0.08), in: RoundedRectangle(cornerRadius: 14))
                .overlay {
                    if problem != nil {
                        RoundedRectangle(cornerRadius: 14).strokeBorder(.red)
                    }
                }
                .padding(.top, 20)

            if let message {
                Label(message, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote)
                    .foregroundStyle(.red)
            }

            Spacer()

            PrimaryButton(title: isChecking ? "Connecting…" : "Connect", action: connect)
                .padding(.horizontal, -24)
                .opacity(canConnect ? 1 : 0.4)
                .disabled(!canConnect)
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.canvas)
        .onAppear {
            if startWithBadToken { problem = .badToken }
        }
    }

    private var trimmed: String { token.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canConnect: Bool { !trimmed.isEmpty && !isChecking }

    private var message: String? {
        switch problem {
        case .badToken: "That token didn’t work. Make a new one in Library."
        case .offline: "Couldn’t reach Sticker Index. Check your connection."
        case .keychain: "Couldn’t save the token on this iPhone. Try again."
        case nil: nil
        }
    }

    private func connect() {
        let candidate = trimmed
        isChecking = true
        problem = nil
        Task {
            defer { isChecking = false }
            do {
                try await API.check(token: candidate)
                if TokenStore.save(candidate) {
                    onConnected(candidate)
                } else {
                    problem = .keychain
                }
            } catch APIError.badToken, APIError.rejected {
                problem = .badToken
            } catch {
                problem = .offline
            }
        }
    }
}
