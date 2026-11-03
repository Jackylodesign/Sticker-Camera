// The AI models that cut out stickers on Android and computers (not iPhone,
// which uses Apple's Copy Subject). Change these only to try another model.

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
