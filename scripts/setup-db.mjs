// Creates the `stickers` and `api_tokens` tables (and adds newer columns). Safe to run more than once.
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
// Stage 3: the small watermarked copy shown in the public gallery (only set
// while the sticker is public).
await sql`ALTER TABLE stickers ADD COLUMN IF NOT EXISTS display_pathname text`;
// Stage 4: personal API tokens for the Figma plugin. Only a SHA-256 hash of
// each token is stored.
await sql`
  CREATE TABLE IF NOT EXISTS api_tokens (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash   text NOT NULL UNIQUE,
    label        text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz,
    revoked_at   timestamptz
  )`;

console.log("Database is ready: tables `stickers` and `api_tokens` exist.");
