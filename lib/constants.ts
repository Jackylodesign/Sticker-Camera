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

// ---------- Image sizes ----------
// Photos are scaled down to this longest side before processing.
// Bigger = sharper sticker, but more memory (iPhones kill tabs that use too much).
export const MAX_PHOTO_SIDE = 2048;

// Pixels with alpha below this (0-255) count as "background" when
// cropping the sticker tight to the subject.
export const TRIM_ALPHA_THRESHOLD = 10;
