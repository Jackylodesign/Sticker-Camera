// The picture shown when someone shares a Sticker Index link (iMessage,
// WhatsApp, Slack, X…). 1200×630: a slice of the infinite canvas, no text.
// Only public, small display copies are used, never originals.

import { get } from "@vercel/blob";
import { ImageResponse } from "next/og";
import { CANVAS } from "@/lib/constants";
import { sql } from "@/lib/db";

export const alt = "Sticker Index: a personal collection of everyday things, cut out and kept as stickers.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Remake it at most once an hour, so new public stickers show up.
export const revalidate = 3600;

// The canvas grid at ~80% scale, so a few rows fit the card.
const CELL = Math.round(CANVAS.cellSize * 0.8);
const GAP = Math.round(CANVAS.gap * 0.8);

export default async function Image() {
  const stickers = await publicStickerImages(12);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", overflow: "hidden", background: CANVAS.background }}>
        {stickers.length > 0 ? (
          // A slice of the infinite canvas: same grid, same repeat order, cut
          // off at the edges so it reads as "this keeps going".
          gridCells(stickers.length).map(({ x, y, index }) => (
            <img
              key={`${x},${y}`}
              src={stickers[index]}
              width={CELL}
              height={CELL}
              style={{ position: "absolute", left: x, top: y, objectFit: "contain", padding: (CELL * (1 - CANVAS.stickerSize)) / 2 }}
            />
          ))
        ) : (
          // No public stickers yet: the mark on its own.
          <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
            <Mark size={160} />
          </div>
        )}
      </div>
    ),
    size,
  );
}

// Grid cells covering the image, laid out like components/InfiniteCanvas.tsx:
// each row starts further along the list.
function gridCells(n: number) {
  const pitch = CELL + GAP;
  const cols = Math.ceil(Math.sqrt(n));
  const shift = cols % n === 0 ? cols + 1 : cols;
  // Shifted half a cell so the left and right edges cut through stickers,
  // which makes the "it keeps going" feeling obvious.
  const ox = size.width / 2;
  const oy = (size.height - pitch) / 2;
  const cells: { x: number; y: number; index: number }[] = [];
  for (let r = Math.floor(-oy / pitch) - 1; r * pitch + oy < size.height; r++) {
    for (let c = Math.floor(-ox / pitch) - 1; c * pitch + ox < size.width; c++) {
      cells.push({ x: c * pitch + ox + GAP / 2, y: r * pitch + oy + GAP / 2, index: mod(c + r * shift, n) });
    }
  }
  return cells;
}

function mod(a: number, b: number) {
  return ((a % b) + b) % b;
}

// Same drawing as components/LogoMark.tsx (kept separate: this one runs in
// the image generator, which only understands plain SVG).
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-8" />
      <path d="M14 3v4a3 3 0 0 0 3 3h4z" />
    </svg>
  );
}

// Newest public stickers' display copies, as data URLs. Empty on any error,
// so the card still renders (with just the mark).
async function publicStickerImages(limit: number): Promise<string[]> {
  try {
    const rows = (await sql`
      SELECT display_pathname FROM stickers
      WHERE is_public AND display_pathname IS NOT NULL
      ORDER BY created_at DESC
      LIMIT ${limit}`) as { display_pathname: string }[];
    const images = await Promise.all(
      rows.map(async (r) => {
        const res = await get(r.display_pathname, { access: "private" });
        if (res?.statusCode !== 200 || !res.stream) return null;
        const buf = Buffer.from(await new Response(res.stream).arrayBuffer());
        return `data:image/png;base64,${buf.toString("base64")}`;
      }),
    );
    return images.filter((x): x is string => x !== null);
  } catch {
    return [];
  }
}
