import type { Viewport } from "next";
import InfiniteCanvas from "@/components/InfiniteCanvas";
import { CANVAS } from "@/lib/constants";
import { publicStickerIds } from "@/lib/db";

export const metadata = { title: "Canvas · Sticker Camera" };
export const viewport: Viewport = { themeColor: CANVAS.background };
// Always read the database, so a sticker made private disappears at once.
export const dynamic = "force-dynamic";

// PUBLIC page (no sign-in): public stickers on an endless, draggable grid.
export default async function CanvasPage() {
  const ids = await publicStickerIds();
  return <InfiniteCanvas ids={ids} />;
}
