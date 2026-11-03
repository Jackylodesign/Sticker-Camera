// The public gallery image route and the owner-only place search.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as galleryImage } from "@/app/api/gallery/[id]/image/route";
import { GET as places } from "@/app/api/places/route";
import { blob, dbAnswers, OWNER, queries, signedInAs } from "./mocks";

vi.mock("@/lib/geocode", () => ({ searchPlaces: vi.fn(async () => [{ label: "London" }]) }));
const { searchPlaces } = await import("@/lib/geocode");

const ID = "0b7c2f2e-1111-4222-8333-444455556666";
const open = () => galleryImage(new Request("https://x"), { params: Promise.resolve({ id: ID }) });

describe("GET /api/gallery/[id]/image (public)", () => {
  it("sends the display copy, never cached", async () => {
    dbAnswers(() => [{ display_pathname: "display/a.png" }]);
    const res = await open();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(blob.get).toHaveBeenCalledWith("display/a.png", { access: "private" });
  });

  it("asks the database only for public stickers with a display copy", async () => {
    await open();
    const [q] = queries;
    expect(q.text).toMatch(/^SELECT display_pathname FROM stickers WHERE/);
    expect(q.text).toContain("AND is_public AND display_pathname IS NOT NULL");
    expect(q.values).toEqual([ID]);
  });

  it("never reads the original, even if the row has one", async () => {
    dbAnswers(() => [{ pathname: "stickers/original.png", display_pathname: "display/a.png" }]);
    await open();
    expect(blob.get).toHaveBeenCalledTimes(1);
    expect(blob.get.mock.calls[0][0]).toBe("display/a.png");
    expect(queries[0].text).not.toMatch(/\bpathname\b/); // display_pathname only
  });

  it("is 404 (no-store) when the sticker is private or unknown", async () => {
    dbAnswers(() => []);
    const res = await open();
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(blob.get).not.toHaveBeenCalled();
  });

  it("is 404 when the file is missing from Blob", async () => {
    dbAnswers(() => [{ display_pathname: "display/a.png" }]);
    blob.get.mockResolvedValueOnce(null);
    expect((await open()).status).toBe(404);
  });

  it("doesn't need anyone signed in", async () => {
    signedInAs(null);
    dbAnswers(() => [{ display_pathname: "display/a.png" }]);
    expect((await open()).status).toBe(200);
  });
});

describe("GET /api/places", () => {
  const search = (q: string) => places(new Request(`https://x/api/places?q=${encodeURIComponent(q)}`));
  beforeEach(() => {
    signedInAs(OWNER);
    vi.mocked(searchPlaces).mockClear();
  });

  it("needs the owner", async () => {
    signedInAs(null);
    expect((await search("London")).status).toBe(401);
    signedInAs("stranger@example.com");
    expect((await search("London")).status).toBe(401);
    expect(searchPlaces).not.toHaveBeenCalled();
  });

  it("searches with the trimmed text", async () => {
    const res = await search("  Mong Kok ");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ label: "London" }]);
    expect(searchPlaces).toHaveBeenCalledWith("Mong Kok");
  });

  it.each([
    ["empty", ""],
    ["1 character", "a"],
    ["only spaces", "     "],
    ["101 characters", "a".repeat(101)],
  ])("rejects %s", async (_name, q) => {
    expect((await search(q)).status).toBe(400);
    expect(searchPlaces).not.toHaveBeenCalled();
  });

  it.each([2, 100])("accepts %i characters", async (n) => {
    expect((await search("a".repeat(n))).status).toBe(200);
  });

  it("rejects a missing q", async () => {
    expect((await places(new Request("https://x/api/places"))).status).toBe(400);
  });
});
