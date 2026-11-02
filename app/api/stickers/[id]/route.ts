import { del } from "@vercel/blob";
import { sql } from "@/lib/db";
import { requireOwner } from "@/lib/owner";

// Delete a sticker: its file in Blob, then its row.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { id } = await params;
  const rows = await sql`SELECT pathname FROM stickers WHERE id::text = ${id}`;
  if (rows.length === 0) return Response.json({ error: "Not found" }, { status: 404 });

  await del(rows[0].pathname as string);
  await sql`DELETE FROM stickers WHERE id::text = ${id}`;
  return new Response(null, { status: 204 });
}
