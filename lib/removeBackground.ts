// Talks to the background-removal Web Worker from the page.

export type WorkerRequest =
  | { type: "preload" }
  | { type: "segment"; id: number; pixels: Uint8ClampedArray; width: number; height: number };

export type WorkerResponse =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready" }
  | { type: "mask"; id: number; mask: Uint8Array; size: number }
  | { type: "error"; id?: number; message: string };

export type ModelStatus =
  | { state: "loading"; loaded: number; total: number }
  | { state: "ready" }
  | { state: "error"; message: string };

type Listener = (s: ModelStatus) => void;

let worker: Worker | null = null;
let status: ModelStatus = { state: "loading", loaded: 0, total: 0 };
const listeners = new Set<Listener>();
const pending = new Map<number, { resolve: (c: HTMLCanvasElement) => void; reject: (e: Error) => void; photo: HTMLCanvasElement }>();
let nextId = 1;

function setStatus(s: ModelStatus) {
  status = s;
  listeners.forEach((l) => l(s));
}

function getWorker() {
  if (worker) return worker;
  // `new URL(..., import.meta.url)` lets Next.js bundle the worker file.
  worker = new Worker(new URL("./removeBackground.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data;
    if (msg.type === "progress") setStatus({ state: "loading", loaded: msg.loaded, total: msg.total });
    else if (msg.type === "ready") setStatus({ state: "ready" });
    else if (msg.type === "mask") {
      const job = pending.get(msg.id);
      pending.delete(msg.id);
      job?.resolve(applyMask(job.photo, msg.mask, msg.size));
    } else if (msg.type === "error") {
      if (msg.id !== undefined) {
        pending.get(msg.id)?.reject(new Error(msg.message));
        pending.delete(msg.id);
      } else {
        setStatus({ state: "error", message: msg.message });
      }
    }
  };
  return worker;
}

/** Start downloading the model straight away, so it's ready by the time a photo is taken. */
export function preloadModel() {
  getWorker().postMessage({ type: "preload" } satisfies WorkerRequest);
}

export function subscribeModelStatus(l: Listener) {
  listeners.add(l);
  l(status);
  return () => void listeners.delete(l);
}

/** Returns a new canvas: the photo with its background made transparent. */
export function removeBackground(photo: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const id = nextId++;
  const { width, height } = photo;
  const pixels = photo.getContext("2d")!.getImageData(0, 0, width, height).data;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, photo });
    // Passing pixels.buffer in the second argument *moves* the memory to the
    // worker instead of copying it.
    getWorker().postMessage({ type: "segment", id, pixels, width, height } satisfies WorkerRequest, [pixels.buffer]);
  });
}

// The model returns a small square mask (e.g. 1024x1024). We stretch it back
// to the photo's size and use it as the photo's transparency.
function applyMask(photo: HTMLCanvasElement, mask: Uint8Array, size: number) {
  // 1. Put the mask into a canvas as an alpha-only image.
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = maskCanvas.height = size;
  const maskCtx = maskCanvas.getContext("2d")!;
  const maskData = maskCtx.createImageData(size, size);
  for (let i = 0; i < mask.length; i++) maskData.data[i * 4 + 3] = mask[i];
  maskCtx.putImageData(maskData, 0, 0);

  // 2. Draw the photo, then "destination-in" keeps only the photo pixels where
  //    the (scaled, smoothly interpolated) mask is opaque.
  const out = document.createElement("canvas");
  out.width = photo.width;
  out.height = photo.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(photo, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(maskCanvas, 0, 0, photo.width, photo.height);
  return out;
}
