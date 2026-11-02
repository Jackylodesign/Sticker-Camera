import { put } from "@vercel/blob";
import { sql, type StickerRow } from "@/lib/db";
import { MAX_UPLOAD_BYTES } from "@/lib/limits";
import { preflight, withCors } from "@/lib/cors";
import { reverseGeocode } from "@/lib/geocode";
import { parseCoords, parseTakenAt } from "@/lib/meta";
import { requireOwner, requireOwnerOrToken } from "@/lib/owner";
import { readPngSize } from "@/lib/png";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// List all stickers, newest first. Also used by the Figma plugin (token).
export async function GET(request: Request) {
  const denied = await requireOwnerOrToken(request);
  if (denied) return withCors(denied);

  const rows = (await sql`
    SELECT id, width, height, bytes, created_at, is_public
    FROM stickers ORDER BY created_at DESC`) as StickerRow[];
  return withCors(Response.json(rows));
}

export function OPTIONS() {
  return preflight("GET");
}

// Upload one sticker: a multipart form with `file` (PNG) and `id` (a uuid
// made by the app), plus optional `taken_at` (ISO date) and `lat` + `lng`.
// The app picks the id so that if an upload is retried
// after a lost connection, it doesn't create a duplicate.
export async function POST(request: Request) {
  const denied = await requireOwner();
  if (denied) return denied;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected a multipart form" }, { status: 400 });
  }
  const id = form.get("id");
  const file = form.get("file");
  if (typeof id !== "string" || !UUID.test(id)) {
    return Response.json({ error: "Missing or bad id" }, { status: 400 });
  }
  if (!(file instanceof File) || file.type !== "image/png") {
    return Response.json({ error: "File must be a PNG" }, { status: 415 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "File is too big" }, { status: 413 });
  }
  // Optional, but if sent they must be valid.
  const takenAtField = form.get("taken_at");
  const takenAt = takenAtField === null ? new Date() : parseTakenAt(takenAtField);
  if (!takenAt) return Response.json({ error: "Bad taken_at" }, { status: 400 });
  const latField = form.get("lat");
  const lngField = form.get("lng");
  const coords = latField === null && lngField === null ? null : parseCoords(latField, lngField);
  if ((latField !== null || lngField !== null) && !coords) {
    return Response.json({ error: "Bad lat/lng" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const size = readPngSize(bytes);
  if (!size) return Response.json({ error: "File is not a valid PNG" }, { status: 415 });

  // Already saved by an earlier try? Then we're done.
  const existing = await sql`SELECT id FROM stickers WHERE id = ${id}`;
  if (existing.length > 0) return Response.json({ id }, { status: 201 });

  // The store is private: this file can only be read with our secret token.
  const pathname = `stickers/${id}.png`;
  await put(pathname, Buffer.from(bytes), {
    access: "private",
    contentType: "image/png",
    addRandomSuffix: false,
    allowOverwrite: true, // a retry may re-send the same file
  });
  // Place names come from Nominatim. If it fails, the names stay empty.
  const names = coords ? await reverseGeocode(coords) : { place_name: null, area_name: null };
  await sql`
    INSERT INTO stickers (id, pathname, width, height, bytes, taken_at, lat, lng, place_name, area_name)
    VALUES (${id}, ${pathname}, ${size.width}, ${size.height}, ${bytes.length}, ${takenAt.toISOString()},
            ${coords?.lat ?? null}, ${coords?.lng ?? null}, ${names.place_name}, ${names.area_name})
    ON CONFLICT (id) DO NOTHING`;

  return Response.json({ id }, { status: 201 });
}
