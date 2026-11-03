// POST /api/stickers (upload) and PATCH /api/stickers/[id] (public/private, edit).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/stickers/route";
import { PATCH } from "@/app/api/stickers/[id]/route";
import { DISPLAY_MAX_SIDE } from "@/lib/constants";
import { MAX_UPLOAD_BYTES } from "@/lib/limits";
import { blob, dbAnswers, OWNER, queries, signedInAs, sql } from "./mocks";
import { pngFile } from "./png";

vi.mock("@/lib/geocode", () => ({
  reverseGeocode: vi.fn(async () => ({ place_name: "Shop, Mong Kok, Hong Kong", area_name: "Mong Kok, Hong Kong" })),
}));
const { reverseGeocode } = await import("@/lib/geocode");

const ID = "0b7c2f2e-1111-4222-8333-444455556666";
const params = { params: Promise.resolve({ id: ID }) };

beforeEach(() => {
  signedInAs(OWNER);
  vi.mocked(reverseGeocode).mockClear();
});

const inserts = () => queries.filter((q) => q.text.startsWith("INSERT INTO stickers"));

function upload(fields: Record<string, string | File>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return POST(new Request("https://x/api/stickers", { method: "POST", body: form }));
}

describe("POST /api/stickers", () => {
  it("needs the owner", async () => {
    signedInAs(null);
    expect((await upload({ id: ID, file: pngFile() })).status).toBe(401);
  });

  it("saves a sticker with names from reverseGeocode", async () => {
    const res = await upload({
      id: ID,
      file: pngFile(120, 80),
      taken_at: "2026-10-12T08:00:00Z",
      lat: "22.3",
      lng: "114.17",
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: ID });
    expect(blob.put).toHaveBeenCalledWith(
      `stickers/${ID}.png`,
      expect.anything(),
      expect.objectContaining({ access: "private" }),
    );
    expect(reverseGeocode).toHaveBeenCalledWith({ lat: 22.3, lng: 114.17 });
    const [insert] = inserts();
    expect(insert.values).toEqual([
      ID,
      `stickers/${ID}.png`,
      120,
      80,
      33,
      "2026-10-12T08:00:00.000Z",
      22.3,
      114.17,
      "Shop, Mong Kok, Hong Kong",
      "Mong Kok, Hong Kong",
    ]);
  });

  it("doesn't look up names without a location", async () => {
    expect((await upload({ id: ID, file: pngFile() })).status).toBe(201);
    expect(reverseGeocode).not.toHaveBeenCalled();
    expect(inserts()[0].values.slice(6)).toEqual([null, null, null, null]);
  });

  it("a retry of a saved id answers 201 without saving twice", async () => {
    dbAnswers((q) => (q.text.startsWith("SELECT id FROM stickers") ? [{ id: ID }] : []));
    const res = await upload({ id: ID, file: pngFile() });
    expect(res.status).toBe(201);
    expect(inserts()).toHaveLength(0);
    expect(blob.put).not.toHaveBeenCalled();
  });

  it.each([
    ["no id", { file: pngFile() }, 400],
    ["bad id", { id: "not-a-uuid", file: pngFile() }, 400],
    ["sql-ish id", { id: `${ID}' OR 1=1`, file: pngFile() }, 400],
    ["no file", { id: ID }, 415],
    ["not a PNG type", { id: ID, file: new File(["x"], "a.jpg", { type: "image/jpeg" }) }, 415],
    ["PNG type, not PNG bytes", { id: ID, file: new File(["x".repeat(40)], "a.png", { type: "image/png" }) }, 415],
    ["too big", { id: ID, file: pngFile(10, 10, MAX_UPLOAD_BYTES) }, 413],
    ["bad taken_at", { id: ID, file: pngFile(), taken_at: "yesterday" }, 400],
    ["taken_at in the future", { id: ID, file: pngFile(), taken_at: "2999-01-01T00:00:00Z" }, 400],
    ["lat without lng", { id: ID, file: pngFile(), lat: "22.3" }, 400],
    ["lat out of range", { id: ID, file: pngFile(), lat: "91", lng: "0" }, 400],
    ["lng not a number", { id: ID, file: pngFile(), lat: "1", lng: "east" }, 400],
  ] as [string, Record<string, string | File>, number][])("rejects %s (%i)", async (_name, fields, status) => {
    const res = await upload(fields);
    expect(res.status).toBe(status);
    expect(blob.put).not.toHaveBeenCalled();
    expect(inserts()).toHaveLength(0);
  });

  it("rejects a body that isn't a form", async () => {
    const res = await POST(new Request("https://x/api/stickers", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
  });
});

function patchForm(fields: Record<string, string | File>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return PATCH(new Request("https://x", { method: "PATCH", body: form }), params);
}

function patchJson(body: unknown) {
  return PATCH(
    new Request("https://x", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    params,
  );
}

const updates = () => queries.filter((q) => q.text.startsWith("UPDATE stickers"));

describe("PATCH public / private", () => {
  beforeEach(() => {
    dbAnswers((q) => (q.text.startsWith("SELECT display_pathname") ? [{ display_pathname: "display/old.png" }] : []));
  });

  it("needs the owner", async () => {
    signedInAs(null);
    expect((await patchForm({ is_public: "false" })).status).toBe(401);
    expect(updates()).toHaveLength(0);
  });

  it("making public saves a small copy and replaces the old one", async () => {
    const res = await patchForm({ is_public: "true", display: pngFile(DISPLAY_MAX_SIDE, 300) });
    expect(res.status).toBe(200);
    expect(blob.put).toHaveBeenCalledWith(
      `display/${ID}.png`,
      expect.anything(),
      expect.objectContaining({ access: "private" }),
    );
    expect(updates()[0].values[0]).toBe(`display/${ID}-abc123.png`);
    expect(blob.del).toHaveBeenCalledWith("display/old.png");
  });

  it.each([
    ["wider", DISPLAY_MAX_SIDE + 1, 10],
    ["taller", 10, DISPLAY_MAX_SIDE + 1],
  ])("making public rejects a display copy %s than DISPLAY_MAX_SIDE", async (_name, w, h) => {
    const res = await patchForm({ is_public: "true", display: pngFile(w, h) });
    expect(res.status).toBe(400);
    expect(blob.put).not.toHaveBeenCalled();
    expect(updates()).toHaveLength(0);
  });

  it.each([
    ["no display file", {}],
    ["a JPEG", { display: new File(["x"], "a.jpg", { type: "image/jpeg" }) }],
    ["fake PNG bytes", { display: new File(["x".repeat(40)], "a.png", { type: "image/png" }) }],
    ["over 2 MB", { display: pngFile(10, 10, 2 * 1024 * 1024) }],
  ])("making public rejects %s", async (_name, fields) => {
    const res = await patchForm({ is_public: "true", ...fields });
    expect([413, 415]).toContain(res.status);
    expect(updates()).toHaveLength(0);
  });

  it("making private clears display_pathname first, then deletes the file", async () => {
    const res = await patchForm({ is_public: "false" });
    expect(res.status).toBe(200);
    expect(updates()[0].text).toContain("is_public = false, display_pathname = NULL");
    expect(blob.del).toHaveBeenCalledWith("display/old.png");
    // Row first: the public image route stops at once, even if the delete fails.
    const update = queries.findIndex((q) => q.text.startsWith("UPDATE stickers"));
    expect(sql.mock.invocationCallOrder[update]).toBeLessThan(blob.del.mock.invocationCallOrder[0]);
  });

  it.each(["yes", "1", ""])("rejects is_public=%j", async (value) => {
    expect((await patchForm({ is_public: value })).status).toBe(400);
  });

  it("is 404 for an unknown sticker", async () => {
    dbAnswers(() => []);
    expect((await patchForm({ is_public: "false" })).status).toBe(404);
  });
});

describe("PATCH JSON edit", () => {
  const saved = {
    taken_at: "2026-10-12T08:00:00.000Z",
    lat: 51.5,
    lng: -0.12,
    place_name: "Old place",
    area_name: "Old area",
  };
  beforeEach(() => {
    dbAnswers((q) => (q.text.startsWith("SELECT taken_at") ? [{ ...saved }] : []));
  });

  it("new coordinates look up names again", async () => {
    const res = await patchJson({ lat: 22.3, lng: 114.17 });
    expect(res.status).toBe(200);
    expect(reverseGeocode).toHaveBeenCalledWith({ lat: 22.3, lng: 114.17 });
    expect(await res.json()).toMatchObject({ lat: 22.3, lng: 114.17, area_name: "Mong Kok, Hong Kong" });
  });

  it("names sent with coordinates override the looked-up ones", async () => {
    const res = await patchJson({ lat: 22.3, lng: 114.17, place_name: "  My   shop ", area_name: "" });
    expect(await res.json()).toMatchObject({ place_name: "My shop", area_name: null });
    expect(reverseGeocode).not.toHaveBeenCalled();
  });

  it("still looks up names when only one name is sent with coordinates", async () => {
    const res = await patchJson({ lat: 22.3, lng: 114.17, place_name: "My shop" });
    expect(reverseGeocode).toHaveBeenCalledWith({ lat: 22.3, lng: 114.17 });
    expect(await res.json()).toMatchObject({ place_name: "My shop", area_name: "Mong Kok, Hong Kong" });
  });

  it("lat/lng null clears the location and its names", async () => {
    const res = await patchJson({ lat: null, lng: null });
    expect(await res.json()).toMatchObject({ lat: null, lng: null, place_name: null, area_name: null });
    expect(reverseGeocode).not.toHaveBeenCalled();
    expect(updates()[0].values).toEqual([saved.taken_at, null, null, null, null, ID]);
  });

  it("changes only the date when only taken_at is sent", async () => {
    const res = await patchJson({ taken_at: "2025-01-02T03:04:05Z" });
    expect(await res.json()).toEqual({ id: ID, ...saved, taken_at: "2025-01-02T03:04:05.000Z" });
  });

  // SURPRISING but harmless: a JSON array counts as an object with no fields,
  // so it saves the sticker unchanged.
  it("treats [] as an empty edit", async () => {
    const res = await patchJson([]);
    expect(res.status).toBe(200);
    expect(updates()[0].values).toEqual([saved.taken_at, saved.lat, saved.lng, saved.place_name, saved.area_name, ID]);
  });

  it.each([
    ["not JSON", "{"],
    ["null", "null"],
    ["bad taken_at", { taken_at: "soon" }],
    ["taken_at a number", { taken_at: 123 }],
    ["only lat", { lat: 1 }],
    ["lat null, lng a number", { lat: null, lng: 1 }],
    ["lat out of range", { lat: -91, lng: 0 }],
    ["lng out of range", { lat: 0, lng: 181 }],
    ["place_name a number", { place_name: 5 }],
    ["area_name an object", { area_name: {} }],
  ])("rejects %s with 400 and saves nothing", async (_name, body) => {
    const res = await patchJson(body);
    expect(res.status).toBe(400);
    expect(updates()).toHaveLength(0);
  });
});
