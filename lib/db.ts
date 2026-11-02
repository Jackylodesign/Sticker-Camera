// Postgres (Neon) connection. Each query is one HTTPS request, which suits
// Vercel functions.

import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL!);

/** One row of the `stickers` table, as the API sends it to the app. */
export type StickerRow = {
  id: string;
  width: number;
  height: number;
  bytes: number;
  created_at: string;
  is_public: boolean;
};

/** Ids of public stickers (newest first). Safe to show anyone: no pathnames. */
export async function publicStickerIds(): Promise<string[]> {
  const rows = (await sql`
    SELECT id FROM stickers
    WHERE is_public AND display_pathname IS NOT NULL
    ORDER BY created_at DESC`) as { id: string }[];
  return rows.map((r) => r.id);
}
