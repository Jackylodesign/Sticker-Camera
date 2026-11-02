import type { Metadata, Viewport } from "next";
import InfiniteCanvas from "@/components/InfiniteCanvas";
import { ABOUT, CANVAS } from "@/lib/constants";
import { publicStickerIds } from "@/lib/db";

// What link previews show (the picture comes from app/opengraph-image.tsx).
const description = ABOUT.paragraphs[0];
export const metadata: Metadata = {
  title: "Sticker Index",
  description,
  openGraph: { type: "website", url: "/", siteName: "Sticker Index", title: "Sticker Index", description },
  twitter: { card: "summary_large_image", title: "Sticker Index", description },
};
export const viewport: Viewport = { themeColor: CANVAS.background };
// Always read the database, so a sticker made private disappears at once.
export const dynamic = "force-dynamic";

// PUBLIC home page (no sign-in): public stickers on an endless, draggable grid.
// The camera lives at /camera.
export default async function HomePage() {
  const ids = await publicStickerIds();
  return <InfiniteCanvas ids={ids} />;
}
