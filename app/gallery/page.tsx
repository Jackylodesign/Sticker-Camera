import GalleryImage from "@/components/GalleryImage";
import { publicStickers } from "@/lib/db";
import { stickerName } from "@/lib/meta";
import grid from "@/app/sticker-grid.module.css";

export const metadata = { title: "Gallery · Sticker Index" };
// Always read the database, so a sticker made private disappears at once.
export const dynamic = "force-dynamic";

// PUBLIC page (no sign-in): only public stickers, as small copies.
export default async function GalleryPage() {
  const stickers = await publicStickers();

  return (
    <main className="screen page">
      <header className="page-header">
        <h1>Stickers by Jacky Lo</h1>
      </header>
      {stickers.length === 0 ? (
        <p className="empty">Nothing here yet.</p>
      ) : (
        <ul className={`${grid.grid} ${grid.gallery}`}>
          {stickers.map((s) => (
            <li key={s.id}>
              <GalleryImage src={`/api/gallery/${s.id}/image`} alt={stickerName(s)} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
