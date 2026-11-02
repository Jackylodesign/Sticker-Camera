import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth, isOwner } from "@/auth";
import { sql } from "@/lib/db";
import StickerDetail from "@/components/StickerDetail";

export const metadata = { title: "Sticker · Sticker Camera" };

// One sticker: preview with styles, download, public/private, delete (owner only).
export default async function StickerPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isOwner((await auth())?.user?.email)) redirect("/signin");

  const { id } = await params;
  const rows = await sql`SELECT id, is_public FROM stickers WHERE id::text = ${id}`;
  if (rows.length === 0) notFound();
  const row = rows[0] as { id: string; is_public: boolean };

  return (
    <main className="screen preview">
      <header className="page-header">
        <Link href="/library">‹ Library</Link>
      </header>
      <StickerDetail id={row.id} initialPublic={row.is_public} />
    </main>
  );
}
