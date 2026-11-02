import { del, put } from "@vercel/blob";
import { DISPLAY_MAX_SIDE } from "@/lib/constants";
import { sql } from "@/lib/db";
import { preflight, withCors } from "@/lib/cors";
import { reverseGeocode } from "@/lib/geocode";
import { parseCoords, parseName, parseTakenAt } from "@/lib/meta";
import { requireOwner, requireOwnerOrToken } from "@/lib/owner";
import { readPngSize } from "@/lib/png";

const MAX_DISPLAY_BYTES = 2 * 1024 * 1024;

// Delete a sticker: its files in Blob (original + gallery copy), then its row.
// Also used by the Figma plugin (token).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOwnerOrToken(request);
  if (denied) return withCors(denied);

  const { id } = await params;
  const rows = await sql`SELECT pathname, display_pathname FROM stickers WHERE id::text = ${id}`;
  if (rows.length === 0) return withCors(Response.json({ error: "Not found" }, { status: 404 }));

  const { pathname, display_pathname } = rows[0] as { pathname: string; display_pathname: string | null };
  await del(display_pathname ? [pathname, display_pathname] : pathname);
  await sql`DELETE FROM stickers WHERE id::text = ${id}`;
  return withCors(new Response(null, { status: 204 }));
}

// Preflight for DELETE only. PATCH stays owner-only and same-site.
export function OPTIONS() {
  return preflight("DELETE");
}

// Make a sticker public or private. A multipart form with:
//   is_public = "true"  + display = the small PNG (made in the app)
//   is_public = "false" (no file)
// Or JSON to edit its date and place (see editMeta below).
// Owner sign-in only: Figma plugin tokens can't call this.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { id } = await params;
  if (request.headers.get("content-type")?.includes("application/json")) return editMeta(request, id);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected a multipart form" }, { status: 400 });
  }
  const isPublic = form.get("is_public");
  if (isPublic !== "true" && isPublic !== "false") {
    return Response.json({ error: "is_public must be true or false" }, { status: 400 });
  }

  const rows = await sql`SELECT display_pathname FROM stickers WHERE id::text = ${id}`;
  if (rows.length === 0) return Response.json({ error: "Not found" }, { status: 404 });
  const oldDisplay = rows[0].display_pathname as string | null;

  if (isPublic === "false") {
    // Update the row first: the public image route stops working right away,
    // even if deleting the file below fails.
    await sql`UPDATE stickers SET is_public = false, display_pathname = NULL WHERE id::text = ${id}`;
    if (oldDisplay) await del(oldDisplay);
    return Response.json({ id, is_public: false });
  }

  // Making it public: check the gallery copy really is a small PNG, so the
  // full-size original can never end up in the gallery.
  const file = form.get("display");
  if (!(file instanceof File) || file.type !== "image/png") {
    return Response.json({ error: "display must be a PNG" }, { status: 415 });
  }
  if (file.size > MAX_DISPLAY_BYTES) return Response.json({ error: "display is too big" }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const size = readPngSize(bytes);
  if (!size) return Response.json({ error: "display is not a valid PNG" }, { status: 415 });
  if (Math.max(size.width, size.height) > DISPLAY_MAX_SIDE) {
    return Response.json({ error: `display must be at most ${DISPLAY_MAX_SIDE}px` }, { status: 400 });
  }

  // Private store, like the originals. A random suffix gives each copy a new name.
  const blob = await put(`display/${id}.png`, Buffer.from(bytes), {
    access: "private",
    contentType: "image/png",
    addRandomSuffix: true,
  });
  await sql`UPDATE stickers SET is_public = true, display_pathname = ${blob.pathname} WHERE id::text = ${id}`;
  if (oldDisplay && oldDisplay !== blob.pathname) await del(oldDisplay);
  return Response.json({ id, is_public: true });
}

// JSON with any of:
//   taken_at: ISO date
//   lat + lng: numbers (place names are looked up again), or both null (clears
//              the location and its names)
//   place_name, area_name: text, or null / "" to clear
// Answers with the sticker's date and place as saved.
async function editMeta(request: Request, id: string) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Expected a JSON object" }, { status: 400 });

  const rows = await sql`
    SELECT taken_at, lat, lng, place_name, area_name FROM stickers WHERE id::text = ${id}`;
  if (rows.length === 0) return Response.json({ error: "Not found" }, { status: 404 });
  const next = rows[0] as MetaRow;
  if (next.taken_at) next.taken_at = new Date(next.taken_at).toISOString();

  if ("taken_at" in body) {
    const takenAt = parseTakenAt(body.taken_at);
    if (!takenAt) return Response.json({ error: "Bad taken_at" }, { status: 400 });
    next.taken_at = takenAt.toISOString();
  }
  if ("lat" in body || "lng" in body) {
    if (body.lat === null && body.lng === null) {
      Object.assign(next, { lat: null, lng: null, place_name: null, area_name: null });
    } else {
      const coords = parseCoords(body.lat, body.lng);
      if (!coords) return Response.json({ error: "Bad lat/lng" }, { status: 400 });
      Object.assign(next, coords, await reverseGeocode(coords));
    }
  }
  for (const key of ["place_name", "area_name"] as const) {
    if (!(key in body)) continue;
    const name = parseName(body[key]);
    if (name === undefined) return Response.json({ error: `Bad ${key}` }, { status: 400 });
    next[key] = name;
  }

  await sql`
    UPDATE stickers SET taken_at = ${next.taken_at}, lat = ${next.lat}, lng = ${next.lng},
      place_name = ${next.place_name}, area_name = ${next.area_name}
    WHERE id::text = ${id}`;
  return Response.json({ id, ...next });
}

type MetaRow = {
  taken_at: string | null;
  lat: number | null;
  lng: number | null;
  place_name: string | null;
  area_name: string | null;
};
