import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, isOwner } from "@/auth";
import RefreshPublicCopies from "@/components/RefreshPublicCopies";
import { sql } from "@/lib/db";

export const metadata = { title: "Library · Sticker Camera" };

type Row = { id: string; is_public: boolean };

// Every sticker on the server, newest first (owner only).
export default async function LibraryPage() {
  // proxy.ts already checks this; checking again keeps the page safe on its own.
  if (!isOwner((await auth())?.user?.email)) redirect("/signin");

  const rows = (await sql`
    SELECT id, is_public FROM stickers ORDER BY created_at DESC`) as Row[];
  const publicIds = rows.filter((r) => r.is_public).map((r) => r.id);

  return (
    <main className="screen page">
      <header className="page-header">
        <Link href="/">‹ Camera</Link>
        <nav>
          <Link href="/history">History</Link>
          <Link href="/gallery">Gallery</Link>
          <Link href="/canvas">Canvas</Link>
        </nav>
      </header>
      {publicIds.length > 0 && (
        <div className="library-tools">
          <RefreshPublicCopies ids={publicIds} />
        </div>
      )}
      {rows.length === 0 ? (
        <p className="empty">No stickers on the server yet.</p>
      ) : (
        <ul className="sticker-grid">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/library/${r.id}`}>
                <img src={`/api/stickers/${r.id}/image?size=thumb`} alt="" loading="lazy" />
                {r.is_public && <span className="badge">Public</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
