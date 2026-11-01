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

// Photos are scaled down to this longest side before processing.
// Bigger = sharper sticker, but more memory (iPhones reload a page that uses
// too much). Both models look at the photo at 1024px anyway.
export const MAX_PHOTO_SIDE = IS_MOBILE ? 1536 : 2048;

// Pixels with alpha below this (0-255) count as "background" when
// cropping the sticker tight to the subject.
export const TRIM_ALPHA_THRESHOLD = 10;
