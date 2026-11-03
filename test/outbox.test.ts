// The phone's upload queue (lib/outbox.ts), on a fake IndexedDB.

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OutboxItem } from "@/lib/outbox";

let outbox: typeof import("@/lib/outbox");
const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
  async () => new Response(null, { status: 201 }),
);

beforeEach(async () => {
  vi.stubGlobal("indexedDB", new IDBFactory()); // empty database
  vi.stubGlobal("navigator", { onLine: true });
  fetch.mockClear();
  vi.stubGlobal("fetch", fetch);
  vi.resetModules();
  outbox = await import("@/lib/outbox");
});

const bytes = (n = 4) => ({ data: new ArrayBuffer(n), type: "image/png" });

/** Puts an item straight into the outbox store, as saveSticker would. */
function store(item: Partial<OutboxItem> & { id: string }) {
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.open("sticker-camera", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("outbox", { keyPath: "id" });
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const t = req.result.transaction("outbox", "readwrite");
      t.objectStore("outbox").put({ createdAt: Date.now(), status: "waiting", thumb: bytes(), png: bytes(), ...item });
      t.oncomplete = () => {
        req.result.close();
        resolve();
      };
    };
  });
}

const uploadedIds = () =>
  fetch.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => (init!.body as FormData).get("id"));

describe("uploadPending", () => {
  it("doesn't upload while still waiting for the location", async () => {
    await store({ id: "a", locatingUntil: Date.now() + 60_000 });
    await outbox.uploadPending();
    expect(uploadedIds()).toEqual([]);
    expect((await outbox.listItems())[0]).toMatchObject({ status: "waiting" });
  });

  it("uploads once the location wait is over, then drops the full PNG", async () => {
    await store({ id: "a", locatingUntil: Date.now() - 1 });
    await outbox.uploadPending();
    expect(uploadedIds()).toEqual(["a"]);
    const [item] = await outbox.listItems();
    expect(item.status).toBe("uploaded");
    expect(item.png).toBeUndefined();
    expect(item.thumb).toBeInstanceOf(Blob);
  });

  it("sends taken_at and the location", async () => {
    await store({ id: "a", takenAt: Date.UTC(2026, 9, 12, 8), lat: 22.3, lng: 114.17 });
    await outbox.uploadPending();
    const form = fetch.mock.calls[0][1]!.body as FormData;
    expect(form.get("taken_at")).toBe("2026-10-12T08:00:00.000Z");
    expect([form.get("lat"), form.get("lng")]).toEqual(["22.3", "114.17"]);
  });

  it("uploads oldest first", async () => {
    await store({ id: "new", createdAt: 2 });
    await store({ id: "old", createdAt: 1 });
    await outbox.uploadPending();
    expect(uploadedIds()).toEqual(["old", "new"]);
  });

  it("marks an item failed with a readable error", async () => {
    fetch.mockResolvedValueOnce(Response.json({ error: "File is too big" }, { status: 413 }));
    await store({ id: "a" });
    await outbox.uploadPending();
    expect((await outbox.listItems())[0]).toMatchObject({ status: "failed", error: "File is too big" });
  });

  it("waits while offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await store({ id: "a", status: "failed" });
    await outbox.uploadPending();
    expect(fetch).not.toHaveBeenCalled();
    expect((await outbox.listItems())[0].status).toBe("waiting");
  });
});

describe("deleteItem", () => {
  it("asks the server to delete a 'failed' item too (the upload may have arrived)", async () => {
    await store({ id: "a", status: "failed" });
    const [item] = await outbox.listItems();
    await outbox.deleteItem(item);
    expect(fetch).toHaveBeenCalledWith("/api/stickers/a", { method: "DELETE" });
    expect(await outbox.listItems()).toEqual([]);
  });

  it("a 404 from the server is fine", async () => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await store({ id: "a", status: "uploaded", png: undefined });
    await outbox.deleteItem((await outbox.listItems())[0]);
    expect(await outbox.listItems()).toEqual([]);
  });

  it("keeps an uploaded item when offline", async () => {
    fetch.mockRejectedValueOnce(new TypeError("offline"));
    await store({ id: "a", status: "uploaded", png: undefined });
    await expect(outbox.deleteItem((await outbox.listItems())[0])).rejects.toThrow(/Couldn't reach the server/);
    expect(await outbox.listItems()).toHaveLength(1);
  });

  it("keeps it when the server refuses", async () => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await store({ id: "a", status: "uploaded", png: undefined });
    await expect(outbox.deleteItem((await outbox.listItems())[0])).rejects.toThrow(/Signed out/);
    expect(await outbox.listItems()).toHaveLength(1);
  });
});
