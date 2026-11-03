// The public must never see where exactly, or when exactly, a sticker was made.
// If one of these fails, a change is about to leak the owner's location.

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GalleryPage from "@/app/gallery/page";
import HomePage from "@/app/page";
import { publicStickers } from "@/lib/db";
import { dbAnswers, queries } from "./mocks";

// A row with everything the database knows, as if the query were widened.
const FULL_ROW = {
  id: "0b7c2f2e-1111-4222-8333-444455556666",
  day: "2026-10-12",
  area: "Mong Kok, Hong Kong",
  lat: 22.31911,
  lng: 114.16936,
  place_name: "Secret Café, Mong Kok, Hong Kong",
  area_name: "Mong Kok, Hong Kong",
  taken_at: "2026-10-12T08:15:00Z",
  created_at: "2026-10-12T08:16:00Z",
  pathname: "stickers/original.png",
  display_pathname: "display/a.png",
};

const SECRETS = ["22.31911", "114.16936", "Secret Café", "08:15", "stickers/original.png", "display/a.png"];

describe("publicStickers()", () => {
  it("selects only id, day and area", async () => {
    await publicStickers();
    const [q] = queries;
    const columns = q.text.match(/^SELECT (.*?) FROM stickers/)?.[1] ?? "";
    // Exactly three selected things, named id, day and area.
    const names = columns.split(/,(?![^(]*\))/).map((c) => c.trim().split(/\s+/).at(-1));
    expect(names).toEqual(["id", "day", "area"]);
    expect(columns).not.toMatch(/\b(lat|lng|place_name|pathname|display_pathname)\b/);
    // The day is just a date (no time) …
    expect(columns).toContain("'YYYY-MM-DD') AS day");
    // … and area is the coarse name only.
    expect(columns).toContain("area_name AS area");
    expect(q.text).toContain("WHERE is_public AND display_pathname IS NOT NULL");
  });

  it("returns only id, day and area, even if the database sends more", async () => {
    dbAnswers(() => [FULL_ROW]);
    const result = await publicStickers();
    expect(result).toEqual([{ id: FULL_ROW.id, day: "2026-10-12", area: "Mong Kok, Hong Kong" }]);
    expect(Object.keys(result[0]).sort()).toEqual(["area", "day", "id"]);
  });
});

describe("gallery page", () => {
  it("uses publicStickers() and shows only image links by id", async () => {
    dbAnswers(() => [FULL_ROW]);
    const html = renderToString(await GalleryPage());
    expect(queries[0].text).toContain("WHERE is_public AND display_pathname IS NOT NULL");
    expect(html).toContain(`/api/gallery/${FULL_ROW.id}/image`);
    for (const secret of SECRETS) expect(html).not.toContain(secret);
  });
});

describe("home page", () => {
  it("passes the canvas only id, day and area", async () => {
    dbAnswers(() => [FULL_ROW]);
    const page = (await HomePage()) as { props: { stickers: object[] } };
    expect(page.props.stickers).toEqual([{ id: FULL_ROW.id, day: "2026-10-12", area: "Mong Kok, Hong Kong" }]);

    const everything = JSON.stringify(page.props) + renderToString(page as never);
    for (const secret of SECRETS) expect(everything).not.toContain(secret);
    expect(everything).not.toMatch(/\b(lat|lng|place_name)\b/);
  });
});
