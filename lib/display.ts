// Makes the small copy shown in the public gallery. It runs in the
// owner's browser (see the PR description for why), from the styled sticker.

import { DISPLAY_MAX_SIDE, WATERMARK } from "./constants";
import { releaseCanvas } from "./photo";
import { canvasToPngBlob } from "./sticker";

export async function makeDisplayImage(sticker: HTMLCanvasElement): Promise<Blob> {
  const scale = Math.min(1, DISPLAY_MAX_SIDE / Math.max(sticker.width, sticker.height));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(sticker.width * scale));
  out.height = Math.max(1, Math.round(sticker.height * scale));
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sticker, 0, 0, out.width, out.height);

  if (WATERMARK.enabled) drawWatermark(ctx, out);

  const blob = await canvasToPngBlob(out);
  releaseCanvas(out);
  return blob;
}

// Text in the bottom-right corner.
function drawWatermark(ctx: CanvasRenderingContext2D, out: HTMLCanvasElement) {
  const longSide = Math.max(out.width, out.height);
  const margin = Math.round(WATERMARK.margin * longSide);
  const font = (px: number) => `600 ${px}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  let size = Math.max(12, Math.round(WATERMARK.size * longSide));
  ctx.font = font(size);
  // Very narrow sticker: shrink the text so it fits across.
  const room = out.width - margin * 2;
  const textWidth = ctx.measureText(WATERMARK.text).width;
  if (textWidth > room) size = Math.max(8, Math.floor((size * room) / textWidth));
  ctx.font = font(size);
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  const x = out.width - margin;
  const y = out.height - margin;
  ctx.lineWidth = Math.max(1, size / 12);
  ctx.strokeStyle = WATERMARK.outline;
  ctx.strokeText(WATERMARK.text, x, y);
  ctx.fillStyle = WATERMARK.color;
  ctx.fillText(WATERMARK.text, x, y);
}
