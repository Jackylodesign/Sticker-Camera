"use client";

import { useEffect, useRef, useState } from "react";
import { canvasToPngBlob, renderSticker, type PreparedSticker, type StickerStyle } from "@/lib/sticker";

export default function PreviewScreen({ sticker, onRetake }: { sticker: PreparedSticker; onRetake: () => void }) {
  const [style, setStyle] = useState<StickerStyle>({ border: true, shadow: true });
  const [url, setUrl] = useState<string | null>(null);
  const rendered = useRef<HTMLCanvasElement | null>(null);

  // Re-draw whenever a toggle changes, and show it as a PNG image.
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    const canvas = renderSticker(sticker, style);
    rendered.current = canvas;
    canvasToPngBlob(canvas).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sticker, style]);

  // Temporary (Stage 1 only): save the current style as a transparent PNG.
  const download = async () => {
    if (!rendered.current) return;
    const blob = await canvasToPngBlob(rendered.current);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sticker-${Date.now()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <main className="screen preview">
      <div className="checkerboard">{url && <img src={url} alt="Sticker preview" />}</div>

      <div className="toggles">
        <Toggle label="White border" on={style.border} onChange={(border) => setStyle((s) => ({ ...s, border }))} />
        <Toggle label="Shadow" on={style.shadow} onChange={(shadow) => setStyle((s) => ({ ...s, shadow }))} />
      </div>

      <div className="controls">
        <button className="button secondary" onClick={onRetake}>
          Retake
        </button>
        <button className="button primary" onClick={download}>
          Download PNG
        </button>
      </div>
    </main>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
