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
