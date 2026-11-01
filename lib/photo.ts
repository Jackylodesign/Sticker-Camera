import { MAX_PHOTO_SIDE } from "./constants";

// Photos only ever live in memory as <canvas> elements. Nothing here saves
// to the Photos library or to disk.

/** Draws an image/video frame into a canvas, scaled down to MAX_PHOTO_SIDE. */
export function toPhotoCanvas(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Grabs the current frame of a live <video>. */
export function captureVideoFrame(video: HTMLVideoElement) {
  return toPhotoCanvas(video, video.videoWidth, video.videoHeight);
}

/** Reads a picked file. createImageBitmap applies the photo's rotation (EXIF) for us. */
export async function loadImageFile(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const canvas = toPhotoCanvas(bitmap, bitmap.width, bitmap.height);
  bitmap.close();
  return canvas;
}
