import { get } from "@vercel/blob";
import { sql } from "@/lib/db";

// PUBLIC route (no sign-in): the small gallery copy of a sticker.
// Works only while the sticker is public, and only ever reads the gallery
// copy, never the original.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await sql`
    SELECT display_pathname FROM stickers
    WHERE id::text = ${id} AND is_public AND display_pathname IS NOT NULL`;
  if (rows.length === 0) return notFound();

  const pathname = rows[0].display_pathname as string;
  const result = await get(pathname, { access: "private" });
  if (result?.statusCode !== 200 || !result.stream) return notFound();

  return new Response(result.stream, {
    headers: {
      // Copies made before the switch to WebP stay PNGs until they're refreshed.
      "Content-Type": pathname.endsWith(".webp") ? "image/webp" : "image/png",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noimageindex",
      // Never cached anywhere, so making a sticker private takes effect at once.
      "Cache-Control": "no-store",
    },
  });
}

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noimageindex" },
  });
}
