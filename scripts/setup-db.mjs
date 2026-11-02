// Creates the `stickers` table. Safe to run more than once.
// Run: npm run db:setup   (reads DATABASE_URL from .env.local)

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Put it in .env.local first.");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS stickers (
    id         uuid PRIMARY KEY,
    pathname   text NOT NULL,            -- where the PNG lives in Vercel Blob
    width      integer NOT NULL,
    height     integer NOT NULL,
    bytes      integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    is_public  boolean NOT NULL DEFAULT false,
    tags       text[]                    -- reserved for later
  )`;
await sql`CREATE INDEX IF NOT EXISTS stickers_created_at_idx ON stickers (created_at DESC)`;

console.log("Database is ready: table `stickers` exists.");
