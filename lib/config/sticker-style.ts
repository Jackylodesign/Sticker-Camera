// How a sticker looks: white border, shadow, and the sizes of its copies.
// Tweak the border and shadow here. After changing STYLE, run
// `npm run build:plugin` so the Figma plugin matches.

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

// Pixels with alpha below this (0-255) count as "background" when
// cropping the sticker tight to the subject.
export const TRIM_ALPHA_THRESHOLD = 10;

// ---------- Public gallery ----------
// Public visitors only ever get this small copy, never the original.
export const DISPLAY_MAX_SIDE = 1200; // px, longest side of the gallery image
// WebP keeps these light: 1200px at this quality is far smaller than a 600px PNG.
export const DISPLAY_WEBP_QUALITY = 82;

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
