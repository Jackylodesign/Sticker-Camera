import { get } from "@vercel/blob";
import sharp from "sharp";
import { THUMB_MAX_SIDE } from "@/lib/config/sticker-style";
import { sql } from "@/lib/db";
import { preflight, withCors } from "@/lib/cors";
import { requireOwnerOrToken } from "@/lib/owner";

// Sends the sticker PNG. The file lives in a private Blob store, so this
// route (which needs you signed in) is the only way to see it.
// Add ?size=thumb for a small WebP copy (used by the Library grid).
// Also used by the Figma plugin (token).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOwnerOrToken(request);
  if (denied) return withCors(denied);

  const { id } = await params;
  const rows = await sql`SELECT pathname FROM stickers WHERE id::text = ${id}`;
  if (rows.length === 0) return withCors(new Response("Not found", { status: 404 }));

  const result = await get(rows[0].pathname as string, { access: "private" });
  if (result?.statusCode !== 200 || !result.stream) return withCors(new Response("Not found", { status: 404 }));

  if (new URL(request.url).searchParams.get("size") === "thumb") {
    const original = Buffer.from(await new Response(result.stream).arrayBuffer());
    const thumb = await sharp(original)
      .resize(THUMB_MAX_SIDE, THUMB_MAX_SIDE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    return withCors(
      new Response(new Uint8Array(thumb), {
        headers: {
          "Content-Type": "image/webp",
          "X-Content-Type-Options": "nosniff",
          // A sticker never changes, so this browser may keep it for a day.
          "Cache-Control": "private, max-age=86400",
        },
      }),
    );
  }

  return withCors(
    new Response(result.stream, {
      headers: {
        "Content-Type": "image/png",
        "X-Content-Type-Options": "nosniff",
        // Only this browser may cache it; shared caches must not.
        "Cache-Control": "private, max-age=3600",
      },
    }),
  );
}

export function OPTIONS() {
  return preflight("GET");
}
