// Postgres (Neon) connection. Each query is one HTTPS request, which suits
// Vercel functions.

import { neon } from "@neondatabase/serverless";
import { DATE_TIME_ZONE } from "./config/limits";

export const sql = neon(process.env.DATABASE_URL!);

/** One row of the `stickers` table, as the API sends it to the app. */
export type StickerRow = {
  id: string;
  width: number;
  height: number;
  bytes: number;
  created_at: string;
  is_public: boolean;
  taken_at: string | null;
  place_name: string | null;
};

/** What the public may know about a sticker. Never coordinates, place_name or times. */
export type PublicSticker = {
  id: string;
  day: string; // "2026-10-12"
  area: string | null; // e.g. "Mong Kok, Hong Kong"
};

/** Public stickers (newest first) with their day and coarse area only. */
export async function publicStickers(): Promise<PublicSticker[]> {
  const rows = (await sql`
    SELECT id,
      to_char(COALESCE(taken_at, created_at) AT TIME ZONE ${DATE_TIME_ZONE}, 'YYYY-MM-DD') AS day,
      area_name AS area
    FROM stickers
    WHERE is_public AND display_pathname IS NOT NULL
    ORDER BY created_at DESC`) as PublicSticker[];
  // Copy only these three fields, so a wider SELECT later can't leak more.
  return rows.map(({ id, day, area }) => ({ id, day, area }));
}
