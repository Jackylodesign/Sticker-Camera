// What kind of device the camera runs on, and how big photos may be there.
// Tweak MAX_PHOTO_SIDE if phones run out of memory or stickers look soft.

// True on phones and tablets (including iPads, which pretend to be Macs).
export const IS_MOBILE =
  typeof navigator !== "undefined" &&
  (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

// True on iPhone / iPad (Safari or the home-screen app). There we use Apple's
// own "Copy Subject" instead of our AI models.
export const IS_IOS =
  typeof navigator !== "undefined" &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

// Photos are scaled down to this longest side before processing.
// Bigger = sharper sticker, but more memory. On Android our models run on the
// phone, so we keep it smaller there (both models look at 1024px anyway).
export const MAX_PHOTO_SIDE = IS_MOBILE && !IS_IOS ? 1536 : 2048;
