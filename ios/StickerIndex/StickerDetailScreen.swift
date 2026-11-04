import SwiftUI

struct StickerDetailScreen: View {
    @ObservedObject var library: LibraryModel
    let item: StickerItem

    @Environment(\.dismiss) private var dismiss
    @State private var image: CGImage?
    @State private var isConfirmingDelete = false
    @State private var isDeleting = false
    @State private var deleteFailed = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Group {
                    if let image {
                        Image(decorative: image, scale: 1)
                            .resizable()
                            .scaledToFit()
                    } else {
                        ProgressView()
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 328)
                .padding(.horizontal, 48)

                VStack(spacing: 0) {
                    row("Date", Text(item.date, format: .dateTime.day().month().year().hour().minute()))
                    Divider().padding(.leading, 16)
                    row("Place", Text(item.placeName ?? "Not recorded"))
                    Divider().padding(.leading, 16)
                    row("Visibility", Text(item.isPublic ? "Public" : "Private"))
                }
                .background(Color(white: 1, opacity: 0.08), in: RoundedRectangle(cornerRadius: 16))
                .padding(.horizontal, 24)

                Text("Public or private and the exact place are changed on the website for now.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 38)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 16)
        }
        .background(Color.canvas)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    isConfirmingDelete = true
                } label: {
                    Image(systemName: "trash")
                }
                .disabled(isDeleting)
                .accessibilityLabel("Delete")
            }
        }
        .alert("Delete this sticker?", isPresented: $isConfirmingDelete) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive, action: delete)
        } message: {
            Text("It’s also removed from Library and the Figma plugin. This can’t be undone.")
        }
        .alert("Couldn’t delete it", isPresented: $deleteFailed) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Check your connection and try again.")
        }
        .task {
            image = await library.thumbnail(for: item.id)
            if let full = await library.fullImage(for: item.id) { image = full }
        }
    }

    private func row(_ label: String, _ value: Text) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack {
                Text(label)
                Spacer()
                value.foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                value.foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .accessibilityElement(children: .combine)
    }

    private func delete() {
        isDeleting = true
        Task {
            defer { isDeleting = false }
            do {
                try await library.delete(item)
                dismiss()
            } catch {
                deleteFailed = true
            }
        }
    }
}
