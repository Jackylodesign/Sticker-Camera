import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth, isOwner } from "@/auth";
import { sql } from "@/lib/db";
import StickerDetail from "@/components/StickerDetail";
import StickerMeta, { type Meta } from "@/components/StickerMeta";

export const metadata = { title: "Sticker · Sticker Camera" };

// One sticker: preview with styles, download, public/private, delete (owner only).
export default async function StickerPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isOwner((await auth())?.user?.email)) redirect("/signin");

  const { id } = await params;
  const rows = await sql`
    SELECT id, is_public, taken_at, lat, lng, place_name, area_name
    FROM stickers WHERE id::text = ${id}`;
  if (rows.length === 0) notFound();
  const row = rows[0] as { id: string; is_public: boolean; taken_at: Date | string | null } & Omit<Meta, "taken_at">;
  const meta: Meta = {
    taken_at: row.taken_at && new Date(row.taken_at).toISOString(),
    lat: row.lat,
    lng: row.lng,
    place_name: row.place_name,
    area_name: row.area_name,
  };

  return (
    <main className="screen preview detail">
      <header className="page-header">
        <Link href="/library">‹ Library</Link>
      </header>
      <StickerDetail id={row.id} initialPublic={row.is_public} />
      <StickerMeta id={row.id} initial={meta} />
    </main>
  );
}
