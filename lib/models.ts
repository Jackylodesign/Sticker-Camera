// Talks to the AI models' Web Worker from the page.

import { releaseCanvas } from "./photo";

export type SelectPoint = { x: number; y: number; include: boolean }; // x/y in photo pixels

export type WorkerRequest =
  | { type: "preload" }
  | { type: "release" }
  | { type: "foreground"; id: number; pixels: Uint8ClampedArray; width: number; height: number }
  | { type: "sam-embed"; id: number; pixels: Uint8ClampedArray; width: number; height: number }
  | { type: "sam-select"; id: number; photoId: number; points: SelectPoint[] };

export type WorkerResponse =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready" }
  | { type: "foreground"; id: number; mask: Uint8Array; size: number }
  | { type: "sam-embed"; id: number }
  | { type: "sam-select"; id: number; mask: Uint8Array }
  | { type: "error"; id?: number; message: string };

export type ModelStatus =
  { state: "loading"; loaded: number; total: number } | { state: "ready" } | { state: "error"; message: string };

type Listener = (s: ModelStatus) => void;
type Job = { resolve: (msg: WorkerResponse) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let status: ModelStatus = { state: "loading", loaded: 0, total: 0 };
const listeners = new Set<Listener>();
const pending = new Map<number, Job>();
let nextId = 1;

function setStatus(s: ModelStatus) {
  status = s;
  listeners.forEach((l) => l(s));
  if (s.state !== "loading") setBusy(pending.size > 0);
}

// If iOS runs out of memory it silently reloads the page. To be able to say
// what happened, we leave a small "busy" note in sessionStorage (it lives only
// in this tab, and holds no photo) while the models are working.
const BUSY_KEY = "sticker-camera-busy"; // old name, kept on purpose
function setBusy(on: boolean) {
  try {
    if (on) sessionStorage.setItem(BUSY_KEY, "1");
    else sessionStorage.removeItem(BUSY_KEY);
  } catch {
    // storage unavailable (e.g. private mode): just skip the note
  }
}

/** True once, if the page was reloaded while the models were working. */
export function pageRestartedWhileBusy(): boolean {
  try {
    const was = sessionStorage.getItem(BUSY_KEY) !== null;
    sessionStorage.removeItem(BUSY_KEY);
    return was;
  } catch {
    return false;
  }
}

function getWorker() {
  if (worker) return worker;
  // `new URL(..., import.meta.url)` lets Next.js bundle the worker file.
  worker = new Worker(new URL("./models.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data;
    if (msg.type === "progress") setStatus({ state: "loading", loaded: msg.loaded, total: msg.total });
    else if (msg.type === "ready") setStatus({ state: "ready" });
    else if (msg.type === "error" && msg.id === undefined) setStatus({ state: "error", message: msg.message });
    else if ("id" in msg && msg.id !== undefined) {
      const job = pending.get(msg.id);
      pending.delete(msg.id);
      setBusy(pending.size > 0 || status.state === "loading");
      if (msg.type === "error") job?.reject(new Error(msg.message));
      else job?.resolve(msg);
    }
  };
  // If the worker itself crashes (e.g. it ran out of memory), fail every
  // waiting job with a readable message instead of hanging forever, and start
  // a fresh worker next time.
  worker.onerror = (e) => {
    e.preventDefault();
    const message = "The sticker AI stopped unexpectedly (the phone may be low on memory). Please try again.";
    pending.forEach((job) => job.reject(new Error(message)));
    pending.clear();
    worker?.terminate();
    worker = null;
    setStatus({ state: "error", message });
  };
  return worker;
}

/** Sends a job to the worker and waits for its answer. */
function request<T extends WorkerResponse>(msg: WorkerRequest & { id: number }, transfer: Transferable[] = []) {
  return new Promise<T>((resolve, reject) => {
    pending.set(msg.id, { resolve: resolve as (m: WorkerResponse) => void, reject });
    setBusy(true);
    getWorker().postMessage(msg, transfer);
  });
}

function photoPixels(photo: HTMLCanvasElement) {
  const { width, height } = photo;
  return { width, height, pixels: photo.getContext("2d")!.getImageData(0, 0, width, height).data };
}

/** Start downloading the models straight away, so they're ready by the time a photo is taken. */
export function preloadModels() {
  setBusy(true); // cleared when the models report ready (or fail)
  getWorker().postMessage({ type: "preload" } satisfies WorkerRequest);
}

/** Frees the current photo's selection data in the worker (e.g. after Retake). */
export function releaseSelection() {
  worker?.postMessage({ type: "release" } satisfies WorkerRequest);
}

export function subscribeModelStatus(l: Listener) {
  listeners.add(l);
  l(status);
  return () => void listeners.delete(l);
}

/**
 * RMBG-1.4: returns the photo's foreground transparency (0-255 per pixel,
 * photo-sized). Good soft edges, but it keeps *everything* that looks like a
 * subject (e.g. you AND the thing in your hand).
 */
export async function getForegroundAlpha(photo: HTMLCanvasElement): Promise<Uint8ClampedArray> {
  const { width, height, pixels } = photoPixels(photo);
  const id = nextId++;
  // Passing pixels.buffer in the second argument *moves* the memory to the
  // worker instead of copying it.
  const res = await request<Extract<WorkerResponse, { type: "foreground" }>>(
    { type: "foreground", id, pixels, width, height },
    [pixels.buffer],
  );
  return scaleMask(res.mask, res.size, width, height);
}

/** SAM step 1: let the model "read" the photo. Returns an id for selectObject(). */
export async function prepareSelection(photo: HTMLCanvasElement): Promise<number> {
  const { width, height, pixels } = photoPixels(photo);
  const id = nextId++;
  await request({ type: "sam-embed", id, pixels, width, height }, [pixels.buffer]);
  return id;
}

/** SAM step 2: returns a photo-sized mask (1 = tapped object, 0 = not) for the given taps. */
export async function selectObject(photoId: number, points: SelectPoint[]): Promise<Uint8Array> {
  const id = nextId++;
  const res = await request<Extract<WorkerResponse, { type: "sam-select" }>>({
    type: "sam-select",
    id,
    photoId,
    points,
  });
  return res.mask;
}

// RMBG returns a small square mask (e.g. 1024x1024). We stretch it back to
// the photo's size by drawing it onto a canvas (the browser smoothly
// interpolates), then read the alpha values back out.
function scaleMask(mask: Uint8Array, size: number, width: number, height: number) {
  const small = document.createElement("canvas");
  small.width = small.height = size;
  const sctx = small.getContext("2d")!;
  const data = sctx.createImageData(size, size);
  for (let i = 0; i < mask.length; i++) data.data[i * 4 + 3] = mask[i];
  sctx.putImageData(data, 0, 0);

  const big = document.createElement("canvas");
  big.width = width;
  big.height = height;
  const bctx = big.getContext("2d")!;
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(small, 0, 0, width, height);
  const rgba = bctx.getImageData(0, 0, width, height).data;
  const alpha = new Uint8ClampedArray(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  releaseCanvas(small);
  releaseCanvas(big);
  return alpha;
}
