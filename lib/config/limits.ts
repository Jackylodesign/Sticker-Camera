// Fixed server-side settings: upload size and the time zone for public dates.

// Vercel functions accept request bodies up to 4.5 MB, so uploads must be
// smaller than that. The app shrinks a sticker that is too big before upload.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

// The public caption shows the day a sticker was taken, as a calendar day in
// this time zone (the exact time is never shown publicly).
export const DATE_TIME_ZONE = "Asia/Hong_Kong";
