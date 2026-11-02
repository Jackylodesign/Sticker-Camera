import type { Viewport } from "next";
import InfiniteCanvas from "@/components/InfiniteCanvas";
import { CANVAS } from "@/lib/constants";
import { publicStickerIds } from "@/lib/db";

export const metadata = { title: "Sticker Index" };
export const viewport: Viewport = { themeColor: CANVAS.background };
// Always read the database, so a sticker made private disappears at once.
export const dynamic = "force-dynamic";

// PUBLIC home page (no sign-in): public stickers on an endless, draggable grid.
// The camera lives at /camera.
export default async function HomePage() {
  const ids = await publicStickerIds();
  return <InfiniteCanvas ids={ids} />;
}
