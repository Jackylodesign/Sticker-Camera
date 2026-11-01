import { SELECTION } from "./constants";

/**
 * Cuts the tapped object out of the photo by combining the two models:
 *  - SAM's mask decides WHICH object (only the thing you tapped).
 *  - RMBG's alpha decides the exact, soft EDGE of it.
 * We keep RMBG's alpha only inside SAM's mask grown by a small margin. If RMBG
 * missed the tapped object entirely, we fall back to SAM's mask on its own.
 */
export function cutOutSelection(
  photo: HTMLCanvasElement,
  rmbgAlpha: Uint8ClampedArray, // 0-255 per pixel
  samMask: Uint8Array, // 0 or 1 per pixel
): HTMLCanvasElement {
  const { width: w, height: h } = photo;
  const n = w * h;

  // How much of the tapped object did RMBG keep?
  let samArea = 0;
  let kept = 0;
  for (let i = 0; i < n; i++) {
    if (samMask[i]) {
      samArea++;
      if (rmbgAlpha[i] >= 128) kept++;
    }
  }
  const useRmbg = samArea > 0 && kept / samArea >= SELECTION.minRmbgCoverage;

  const alpha = new Uint8ClampedArray(n);
  if (useRmbg) {
    // Distance of every pixel from SAM's mask, so we can allow a margin around it.
    const margin = Math.max(1, Math.round(SELECTION.edgeMargin * Math.max(w, h)));
    const dist = new Float64Array(n);
    for (let i = 0; i < n; i++) dist[i] = samMask[i] ? 0 : 1e20;
    distanceTransform2D(dist, w, h);
    for (let i = 0; i < n; i++) {
      // 1 inside the grown mask, fading to 0 over the last pixel.
      const allow = Math.min(1, Math.max(0, margin - Math.sqrt(dist[i]) + 0.5));
      alpha[i] = rmbgAlpha[i] * allow;
    }
  } else {
    for (let i = 0; i < n; i++) alpha[i] = samMask[i] ? 255 : 0;
  }

  // Take the photo's colours and give them the new transparency.
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  const img = photo.getContext("2d")!.getImageData(0, 0, w, h);
  for (let i = 0; i < n; i++) img.data[i * 4 + 3] = alpha[i];
  ctx.putImageData(img, 0, 0);
  return out;
}

/**
 * Exact Euclidean distance transform (Felzenszwalb & Huttenlocher).
 * Input: 0 for "inside" pixels, a huge number for the rest.
 * Output (in place): squared distance from each pixel to the nearest inside pixel.
 * Runs on every column, then every row.
 */
export function distanceTransform2D(grid: Float64Array, w: number, h: number) {
  const len = Math.max(w, h);
  const f = new Float64Array(len);
  const d = new Float64Array(len);
  const v = new Int32Array(len);
  const z = new Float64Array(len + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, d, v, z, h);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, d, v, z, w);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
}

function edt1d(f: Float64Array, d: Float64Array, v: Int32Array, z: Float64Array, n: number) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}
