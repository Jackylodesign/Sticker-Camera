-- The main table: one row per sticker. The PNG itself lives in Vercel Blob.
CREATE TABLE IF NOT EXISTS stickers (
  id         uuid PRIMARY KEY,
  pathname   text NOT NULL,            -- where the PNG lives in Vercel Blob
  width      integer NOT NULL,
  height     integer NOT NULL,
  bytes      integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_public  boolean NOT NULL DEFAULT false,
  tags       text[]                    -- reserved for later
);

CREATE INDEX IF NOT EXISTS stickers_created_at_idx ON stickers (created_at DESC);
