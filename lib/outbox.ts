// The outbox: stickers waiting to be uploaded, kept in the browser's
// IndexedDB so they survive going offline or closing the app.
//
// Life of a sticker:
//   save()   -> stored here with its full PNG + a small thumbnail ("waiting")
//   upload   -> "uploading" -> server answers 201 -> "uploaded"
//   uploaded -> the full PNG is deleted here; only the thumbnail stays
//   failure  -> "failed"; tried again when back online or the app reopens

import { MAX_UPLOAD_BYTES } from "./limits";
import { canvasToPngBlob } from "./sticker";

export type Status = "waiting" | "uploading" | "uploaded" | "failed";

export type OutboxItem = {
  id: string; // same id the server uses
  createdAt: number;
  status: Status;
  thumb: Blob; // ~200px PNG, kept forever (for History)
  png?: Blob; // full sticker, only until it's uploaded
  error?: string;
};

const DB_NAME = "sticker-camera";
const STORE = "outbox";
const THUMB_SIZE = 200;

// ---------- public API ----------

/** Saves a clean cutout to the outbox and starts uploading it. */
export async function saveSticker(cutout: HTMLCanvasElement): Promise<void> {
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    status: "waiting",
    png: await fitUploadLimit(cutout),
    thumb: await makeThumbnail(cutout),
  };
  await put(item);
  // Ask the browser not to clear our storage when space runs low.
  navigator.storage?.persist?.().catch(() => {});
  void uploadPending();
}

export async function listItems(): Promise<OutboxItem[]> {
  const items = await tx("readonly", (s) => s.getAll() as IDBRequest<OutboxItem[]>);
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

/** Removes a sticker: from the server if it was uploaded, then from here. */
export async function deleteItem(item: OutboxItem): Promise<void> {
  if (item.status === "uploaded") {
    const res = await fetch(`/api/stickers/${item.id}`, { method: "DELETE" });
    // 404 = already gone on the server, which is fine.
    if (!res.ok && res.status !== 404) throw new Error(await errorText(res));
  }
  await tx("readwrite", (s) => s.delete(item.id));
  notify();
}

/** Calls `fn` whenever the outbox changes. Returns an "unsubscribe" function. */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let running: Promise<void> | null = null;

/** Uploads everything that still has a full PNG. Safe to call any time. */
export function uploadPending(): Promise<void> {
  // Only one upload loop at a time; extra calls share the running one.
  running ??= uploadLoop().finally(() => (running = null));
  return running;
}

/** Retries uploads when the phone comes back online. Call once on start. */
export function startAutoUpload(): () => void {
  const onOnline = () => void uploadPending();
  window.addEventListener("online", onOnline);
  void uploadPending(); // and right now, in case the app was just reopened
  return () => window.removeEventListener("online", onOnline);
}

// ---------- uploading ----------

async function uploadLoop() {
  const tried = new Set<string>();
  // Keep going until every sticker had one try (one may be saved mid-loop).
  for (;;) {
    const pending = (await listItems()).filter((i) => i.png).reverse(); // oldest first
    const todo = pending.find((i) => !tried.has(i.id));
    if (!todo) return;

    if (!navigator.onLine) {
      // Offline: mark them as waiting; the "online" event resumes us.
      for (const i of pending) if (i.status !== "waiting") await update(i.id, { status: "waiting", error: undefined });
      return;
    }

    tried.add(todo.id);
    await update(todo.id, { status: "uploading", error: undefined });
    try {
      const form = new FormData();
      form.append("id", todo.id);
      form.append("file", todo.png!, `${todo.id}.png`);
      const res = await fetch("/api/stickers", { method: "POST", body: form });
      if (res.status !== 201) throw new Error(await errorText(res));
      // Only now is it safe to forget the full PNG.
      await update(todo.id, { status: "uploaded", png: undefined });
    } catch (err) {
      // Tried again on "online", when the app reopens, or with Retry.
      await update(todo.id, { status: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  }
}

async function errorText(res: Response) {
  if (res.status === 401) return "Signed out. Sign in again, then retry.";
  try {
    return (await res.json()).error ?? `Server error ${res.status}`;
  } catch {
    return `Server error ${res.status}`;
  }
}

// ---------- images ----------

/** A small copy for the History list, keeping transparency. */
function makeThumbnail(src: HTMLCanvasElement): Promise<Blob> {
  const scale = Math.min(1, THUMB_SIZE / Math.max(src.width, src.height));
  return canvasToPngBlob(resized(src, scale));
}

/** The full PNG, shrunk a little at a time only if it's over the upload limit. */
async function fitUploadLimit(src: HTMLCanvasElement): Promise<Blob> {
  let blob = await canvasToPngBlob(src);
  let scale = 1;
  while (blob.size > MAX_UPLOAD_BYTES && scale > 0.2) {
    scale *= 0.85;
    blob = await canvasToPngBlob(resized(src, scale));
  }
  return blob;
}

function resized(src: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  if (scale === 1) return src;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(src.width * scale));
  c.height = Math.max(1, Math.round(src.height * scale));
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

// ---------- IndexedDB plumbing ----------

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((fn) => fn());
}

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Runs one request in a transaction and waits until it's saved to disk. */
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

async function put(item: OutboxItem) {
  await tx("readwrite", (s) => s.put(item));
  notify();
}

async function update(id: string, changes: Partial<OutboxItem>) {
  const item = await tx("readonly", (s) => s.get(id) as IDBRequest<OutboxItem | undefined>);
  if (!item) return; // deleted meanwhile
  const next = { ...item, ...changes };
  if (!next.png) delete next.png; // really drop the big file
  await put(next);
}
