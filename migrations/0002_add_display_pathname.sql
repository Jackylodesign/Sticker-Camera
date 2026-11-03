-- The small watermarked copy shown in the public gallery (only set while the
-- sticker is public).
ALTER TABLE stickers ADD COLUMN IF NOT EXISTS display_pathname text;
