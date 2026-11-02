import Link from "next/link";
import type { Viewport } from "next";
import { CANVAS } from "@/lib/constants";

export const metadata = { title: "About · Sticker" };
export const viewport: Viewport = { themeColor: CANVAS.background };

// PUBLIC page. Placeholder text for now; Jacky will write the real copy.
export default function AboutPage() {
  return (
    <main className="about" style={{ background: CANVAS.background, color: CANVAS.text }}>
      <header className="canvas-bar">
        <Link href="/canvas" className="canvas-bar-title">
          Sticker
        </Link>
      </header>
      <div className="about-body">
        <h1>About</h1>
        <p>A personal collection of stickers by Jacky Lo, cut out from everyday things.</p>
      </div>
    </main>
  );
}
