import SwiftUI

struct LibraryScreen: View {
    @ObservedObject var library: LibraryModel
    let onClose: () -> Void

    @State private var stickerToDiscard: WaitingSticker?

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 9), count: 3)

    var body: some View {
        NavigationStack {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.canvas)
                .navigationTitle("Library")
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button(action: onClose) {
                            Image(systemName: "chevron.backward")
                        }
                        .accessibilityLabel("Back to camera")
                    }
                }
                .navigationDestination(for: String.self) { id in
                    if let item = library.items.first(where: { $0.id == id }) {
                        StickerDetailScreen(library: library, item: item)
                    }
                }
        }
        .tint(.white)
        .alert(
            "Waiting to upload",
            isPresented: Binding(get: { stickerToDiscard != nil }, set: { if !$0 { stickerToDiscard = nil } }),
            presenting: stickerToDiscard
        ) { sticker in
            Button("Keep Waiting", role: .cancel) {}
            Button("Discard", role: .destructive) {
                Task { await library.discard(sticker) }
            }
        } message: { _ in
            Text("It uploads by itself when it can. If you discard it, it’s gone for good.")
        }
        .task { await library.refresh() }
    }

    @ViewBuilder private var content: some View {
        if library.status == .failed, library.items.isEmpty {
            CenteredMessage(title: "Couldn’t load stickers", message: "Check your connection and try again.", button: "Try Again") {
                Task { await library.refresh() }
            }
        } else if library.status == .loading, library.items.isEmpty {
            ProgressView()
        } else if library.items.isEmpty, library.waiting.isEmpty {
            CenteredMessage(title: "No stickers yet", message: "Take a photo to make your first one.", button: "Open Camera", action: onClose)
        } else {
            grid
        }
    }

    private var grid: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(summary)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 16)

                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(library.waiting) { sticker in
                        Button {
                            stickerToDiscard = sticker
                        } label: {
                            WaitingTile(sticker: sticker)
                        }
                    }
                    ForEach(library.items) { item in
                        NavigationLink(value: item.id) {
                            StickerTile(library: library, item: item)
                        }
                        .accessibilityLabel(Text("Sticker, \(item.date, format: .dateTime.day().month().year())"))
                    }
                }
                .padding(.horizontal, 16)
            }
            .padding(.bottom, 24)
        }
    }

    private var summary: String {
        let count = library.items.count + library.waiting.count
        let stickers = count == 1 ? "1 sticker" : "\(count) stickers"
        return library.waiting.isEmpty ? stickers : "\(stickers) · \(library.waiting.count) waiting to upload"
    }
}

private struct StickerTile: View {
    let library: LibraryModel
    let item: StickerItem

    @State private var image: CGImage?

    var body: some View {
        Group {
            if let image {
                Image(decorative: image, scale: 1)
                    .resizable()
                    .scaledToFit()
            } else {
                Color.clear
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .task(id: item.id) {
            image = await library.thumbnail(for: item.id)
        }
    }
}

private struct WaitingTile: View {
    let sticker: WaitingSticker

    var body: some View {
        Group {
            if let image = UIImage(data: sticker.png) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .opacity(0.45)
            } else {
                Color.clear
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .overlay(alignment: .bottomTrailing) { WaitingBadge(size: 28) }
        .accessibilityElement()
        .accessibilityLabel("Sticker waiting to upload")
    }
}

/// A centred message with one action at the bottom.
private struct CenteredMessage: View {
    let title: String
    let message: String
    let button: String
    let action: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            Spacer()
            Text(title).font(.title3.bold())
            Text(message).foregroundStyle(.secondary)
            Spacer()
            PrimaryButton(title: button, action: action)
                .padding(.bottom, 16)
        }
        .multilineTextAlignment(.center)
    }
}
