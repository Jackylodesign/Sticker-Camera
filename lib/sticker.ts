// Turns a transparent cutout into a sticker preview: optional white border
// that hugs the subject's outline, and an optional drop shadow.
// The stored sticker (Stage 2) will be the clean cutout only; this styling is
// applied at use time.

import { STYLE, TRIM_ALPHA_THRESHOLD } from "./constants";

export type StickerStyle = { border: boolean; shadow: boolean };

export type PreparedSticker = {
  subject: HTMLCanvasElement; // cutout, cropped to the subject, with padding around it
  border: HTMLCanvasElement; // same size: a solid white silhouette, grown outwards
  shadow: { blur: number; offsetX: number; offsetY: number };
};

/** Do the slow work once per photo, so toggling styles is instant. */
export function prepareSticker(cutout: HTMLCanvasElement): PreparedSticker {
  const box = findSubjectBounds(cutout);
  const longSide = Math.max(box.w, box.h);

  const borderPx = Math.max(1, Math.round(STYLE.border.width * longSide));
  const shadow = {
    blur: STYLE.shadow.blur * longSide,
    offsetX: STYLE.shadow.offsetX * longSide,
    offsetY: STYLE.shadow.offsetY * longSide,
  };
  // Leave enough empty space around the subject so the border and shadow
  // never get cut off at the edge of the image.
  const pad = Math.ceil(
    borderPx + shadow.blur * 2 + Math.max(Math.abs(shadow.offsetX), Math.abs(shadow.offsetY)),
  );

  const subject = document.createElement("canvas");
  subject.width = box.w + pad * 2;
  subject.height = box.h + pad * 2;
  subject.getContext("2d")!.drawImage(cutout, box.x, box.y, box.w, box.h, pad, pad, box.w, box.h);

  return { subject, border: makeBorder(subject, borderPx), shadow };
}

/** Draws one of the four style combinations into a new canvas. */
export function renderSticker(p: PreparedSticker, style: StickerStyle): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = p.subject.width;
  out.height = p.subject.height;
  const ctx = out.getContext("2d")!;

  // Build the sticker (border underneath, subject on top) in its own layer...
  const layer = document.createElement("canvas");
  layer.width = out.width;
  layer.height = out.height;
  const lctx = layer.getContext("2d")!;
  if (style.border) lctx.drawImage(p.border, 0, 0);
  lctx.drawImage(p.subject, 0, 0);

  // ...then draw that layer once with the canvas' built-in shadow. The shadow
  // follows the layer's transparency, so it traces the sticker's shape.
  if (style.shadow) {
    ctx.shadowColor = STYLE.shadow.color;
    ctx.shadowBlur = p.shadow.blur;
    ctx.shadowOffsetX = p.shadow.offsetX;
    ctx.shadowOffsetY = p.shadow.offsetY;
  }
  ctx.drawImage(layer, 0, 0);
  return out;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png"),
  );
}

// ---------- helpers ----------

function findSubjectBounds(c: HTMLCanvasElement) {
  const { width, height } = c;
  const data = c.getContext("2d")!.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > TRIM_ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  // Nothing found: keep the whole image rather than crash.
  if (maxX < 0) return { x: 0, y: 0, w: width, h: height };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Makes a white silhouette that extends `radius` px beyond the subject.
 *
 * How: for every pixel we compute the exact distance to the nearest solid
 * subject pixel (a "distance transform"). Pixels closer than `radius` become
 * white. The 1px soft ramp at the edge keeps the outline smooth, not jagged.
 * This follows the real outline, rounded corners included.
 */
function makeBorder(subject: HTMLCanvasElement, radius: number) {
  const { width: w, height: h } = subject;
  const src = subject.getContext("2d")!.getImageData(0, 0, w, h).data;

  // Squared distance to the nearest subject pixel (alpha >= 50%).
  const INF = 1e20;
  const dist = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) dist[i] = src[i * 4 + 3] >= 128 ? 0 : INF;
  distanceTransform2D(dist, w, h);

  const border = document.createElement("canvas");
  border.width = w;
  border.height = h;
  const ctx = border.getContext("2d")!;
  const out = ctx.createImageData(w, h);
  const [r, g, b] = hexToRgb(STYLE.border.color);
  for (let i = 0; i < w * h; i++) {
    const a = Math.min(1, Math.max(0, radius - Math.sqrt(dist[i]) + 0.5));
    if (a > 0) {
      out.data[i * 4] = r;
      out.data[i * 4 + 1] = g;
      out.data[i * 4 + 2] = b;
      out.data[i * 4 + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(out, 0, 0);
  return border;
}

// Exact Euclidean distance transform (Felzenszwalb & Huttenlocher), run on
// every column and then every row. Works in place on squared distances.
function distanceTransform2D(grid: Float64Array, w: number, h: number) {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
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

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
