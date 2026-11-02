import GalleryImage from "@/components/GalleryImage";
import { sql } from "@/lib/db";

export const metadata = { title: "Gallery · Sticker Camera" };
// Always read the database, so a sticker made private disappears at once.
export const dynamic = "force-dynamic";

// PUBLIC page (no sign-in): only public stickers, as small watermarked copies.
export default async function GalleryPage() {
  const rows = (await sql`
    SELECT id FROM stickers
    WHERE is_public AND display_pathname IS NOT NULL
    ORDER BY created_at DESC`) as { id: string }[];

  return (
    <main className="screen page">
      <header className="page-header">
        <h1>Stickers by Jacky Lo</h1>
      </header>
      {rows.length === 0 ? (
        <p className="empty">Nothing here yet.</p>
      ) : (
        <ul className="sticker-grid gallery">
          {rows.map((r) => (
            <li key={r.id}>
              <GalleryImage src={`/api/gallery/${r.id}/image`} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
