import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // Lets share previews and icons use full https://stickerindex.page URLs.
  metadataBase: new URL("https://stickerindex.page"),
  title: "Sticker Camera",
  description: "Take a photo, get a sticker.",
  // Keep every page out of search engines.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // use the full iPhone screen, incl. around the notch
  themeColor: "#111111",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
