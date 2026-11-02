// All the knobs you are likely to tweak live in this one file.

// ---------- Sticker style (white border + shadow) ----------
// Sizes are a fraction of the sticker's longer side, so the look stays the
// same whether the photo is 800px or 3000px wide.
// Example: 0.03 on a 1000px sticker = a 30px border.
export const STYLE = {
  border: {
    width: 0.03,
    color: "#ffffff",
  },
  shadow: {
    color: "rgba(0, 0, 0, 0.35)",
    blur: 0.03, // softness
    offsetX: 0,
    offsetY: 0.015, // positive = shadow falls downwards
  },
} as const;

// ---------- Background removal model ----------
// RMBG-1.4 by BRIA AI, run in the browser with transformers.js.
// See the PR description for why this model was chosen.
export const MODEL = {
  id: "briaai/RMBG-1.4",
  // "fp32" = full-quality weights (~176 MB, downloaded once, then cached).
  dtype: "fp32",
  // The model looks at the photo at this resolution.
  inputSize: 1024,
} as const;

// SlimSAM: finds the object you tap on. See the PR description for why.
export const SAM_MODEL = {
  id: "Xenova/slimsam-77-uniform",
  dtype: "fp32",
} as const;

// ---------- Combining the two masks ----------
export const SELECTION = {
  // How far (fraction of the photo's longer side) RMBG's soft edges may reach
  // outside SAM's tapped-object mask. SAM's own edge is a bit rough, so we let
  // RMBG decide the exact edge within this margin.
  edgeMargin: 0.01,
  // If RMBG kept less than this share of the tapped object, RMBG has dropped
  // it (didn't see it as foreground), so we use SAM's mask alone.
  minRmbgCoverage: 0.3,
};

// ---------- Image sizes ----------
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

// Pixels with alpha below this (0-255) count as "background" when
// cropping the sticker tight to the subject.
export const TRIM_ALPHA_THRESHOLD = 10;

// ---------- Public gallery ----------
// Public visitors only ever get this small copy, never the original.
export const DISPLAY_MAX_SIDE = 600; // px, longest side of the gallery image

// The public caption shows the day a sticker was taken, as a calendar day in
// this time zone (the exact time is never shown publicly).
export const DATE_TIME_ZONE = "Asia/Hong_Kong";

// Grid thumbnails in the Library (owner only), longest side in px.
export const THUMB_MAX_SIDE = 400;

export const WATERMARK = {
  // Off: public copies are plain. Turn on to bake the text in again.
  enabled: false,
  text: "© Jacky Lo",
  color: "rgba(255, 255, 255, 0.6)",
  outline: "rgba(0, 0, 0, 0.35)", // thin dark edge so it shows on light and dark
  size: 0.05, // font size, as a fraction of the image's longer side
  margin: 0.03, // gap from the bottom-right corner, same unit
};

// ---------- Infinite canvas (the home page) ----------
// Text in the About panel on the public canvas. Edit freely.
export const ABOUT = {
  paragraphs: [
    "This project is inspired by Andy Warhol’s Time Capsules. I’m capturing the meaning of time, memory and space through everyday objects.",
    "Each object you see here is something I interacted with at a certain time in somewhere. It could mean nothing but something to me.",
    "Thank you for visiting.",
  ],
  credit: "All stickers © Jacky Lo. All rights reserved.",
  // One line for link previews (search results, iMessage, WhatsApp…).
  description: "Sticker Index is a personal collection of everyday things, cut out and kept as stickers.",
};

export const CANVAS = {
  cellSize: 240, // px, width and height of one grid cell
  gap: 40, // px, space between cells
  stickerSize: 0.85, // biggest a sticker may get inside its cell (1 = fills it)
  background: "#0e0e0e",
  text: "#ffffff", // top bar text
  friction: 0.95, // glide after a fling: 0 = stops at once, closer to 1 = glides longer
  hoverScale: 1.06, // desktop: grow a little under the mouse (1 = off)
  // Desktop: the grid drifts a little as the mouse moves, a hint that it can
  // be dragged. Max distance in px from the resting spot (0 = off).
  drift: 40,
  driftEase: 0.06, // how quickly it follows the mouse each frame (0–1)
};
