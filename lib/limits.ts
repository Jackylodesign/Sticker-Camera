// Vercel functions accept request bodies up to 4.5 MB, so uploads must be
// smaller than that. The app shrinks a sticker that is too big before upload.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
