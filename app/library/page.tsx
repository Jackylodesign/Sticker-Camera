import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, isOwner } from "@/auth";
import FigmaTokens, { type TokenInfo } from "@/components/FigmaTokens";
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
  const tokens = await activeTokens();

  return (
    <main className="screen page">
      <header className="page-header">
        <Link href="/camera">‹ Camera</Link>
        <nav>
          <Link href="/history">History</Link>
          <Link href="/gallery">Gallery</Link>
          <Link href="/">Canvas</Link>
        </nav>
      </header>
      <FigmaTokens tokens={tokens} />
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
                {/* eslint-disable-next-line @next/next/no-img-element -- private image: the optimizer can't send the sign-in cookie */}
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

// Tokens that still work. null if the table isn't there yet (SQL not run).
async function activeTokens(): Promise<TokenInfo[] | null> {
  try {
    const rows = (await sql`
      SELECT id, created_at, last_used_at FROM api_tokens
      WHERE revoked_at IS NULL ORDER BY created_at DESC`) as {
      id: string;
      created_at: Date | string;
      last_used_at: Date | string | null;
    }[];
    return rows.map((r) => ({
      id: r.id,
      created_at: new Date(r.created_at).toISOString(),
      last_used_at: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
    }));
  } catch {
    return null;
  }
}
