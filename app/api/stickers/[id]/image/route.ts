import { get } from "@vercel/blob";
import { sql } from "@/lib/db";
import { requireOwner } from "@/lib/owner";

// Sends the sticker PNG. The file lives in a private Blob store, so this
// route (which needs you signed in) is the only way to see it.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { id } = await params;
  const rows = await sql`SELECT pathname FROM stickers WHERE id::text = ${id}`;
  if (rows.length === 0) return new Response("Not found", { status: 404 });

  const result = await get(rows[0].pathname as string, { access: "private" });
  if (result?.statusCode !== 200 || !result.stream) return new Response("Not found", { status: 404 });

  return new Response(result.stream, {
    headers: {
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
      // Only this browser may cache it; shared caches must not.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
