// The picture shown when someone shares a Sticker Index link (iMessage,
// WhatsApp, Slack, X…). 1200×630, made from up to 5 public stickers.
// Only public, small display copies are used, never originals.

import { get } from "@vercel/blob";
import { ImageResponse } from "next/og";
import { ABOUT } from "@/lib/constants";
import { sql } from "@/lib/db";

export const alt = "Sticker Index: a personal collection of everyday things, cut out and kept as stickers.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Remake it at most once an hour, so new public stickers show up.
export const revalidate = 3600;

const BG = "#0e0e0e";
const TILT = [-8, 5, -3, 7, -6]; // degrees, one per sticker

export default async function Image() {
  const stickers = await publicStickerImages(5);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: BG, color: "#fff", padding: 64 }}>
        {/* Row of stickers */}
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", gap: 24 }}>
          {stickers.map((src, i) => (
            <img
              key={i}
              src={src}
              width={190}
              height={190}
              style={{ objectFit: "contain", transform: `rotate(${TILT[i % TILT.length]}deg)` }}
            />
          ))}
        </div>
        {/* Name + one line */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Mark size={44} />
          <div style={{ fontSize: 48, fontWeight: 600, letterSpacing: -1 }}>Sticker Index</div>
        </div>
        <div style={{ marginTop: 14, fontSize: 26, color: "rgba(255,255,255,0.6)" }}>{ABOUT.paragraphs[0]}</div>
      </div>
    ),
    size,
  );
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
// so the card still renders with just the name.
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
