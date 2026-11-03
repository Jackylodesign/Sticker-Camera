-- When and where each sticker was taken. lat/lng and place_name are private
-- (owner only); area_name is coarse ("Mong Kok, Hong Kong") and may be shown
-- publicly. Old stickers get their upload time as the date.
ALTER TABLE stickers ADD COLUMN IF NOT EXISTS taken_at timestamptz;
ALTER TABLE stickers ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE stickers ADD COLUMN IF NOT EXISTS lng double precision;
ALTER TABLE stickers ADD COLUMN IF NOT EXISTS place_name text;
ALTER TABLE stickers ADD COLUMN IF NOT EXISTS area_name text;

-- Only fills empty dates, so running it again changes nothing.
UPDATE stickers SET taken_at = created_at WHERE taken_at IS NULL;
