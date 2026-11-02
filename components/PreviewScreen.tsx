"use client";

import { useEffect, useRef, useState } from "react";
import { errorMessage, saveSticker } from "@/lib/outbox";
import { canvasToPngBlob, renderSticker, type PreparedSticker, type StickerStyle } from "@/lib/sticker";

export default function PreviewScreen({
  sticker,
  onRetake,
  onSaved,
}: {
  sticker: PreparedSticker;
  onRetake: () => void;
  onSaved: (result: "queued" | "uploaded") => void;
}) {
  const [style, setStyle] = useState<StickerStyle>({ border: true, shadow: true });
  const [url, setUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Save the clean cutout only. Border and shadow are added later, when used.
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      onSaved(await saveSticker(sticker.subject));
    } catch (err) {
      setError(`Couldn't save: ${errorMessage(err)}`);
      setSaving(false);
    }
  };

  // Extra: download this preview (with the chosen style) as a PNG file.
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
        <button className="link download" onClick={download}>
          Download this preview
        </button>
      </div>

      {error && <p className="select-error">{error}</p>}

      <div className="controls">
        <button className="button secondary" onClick={onRetake} disabled={saving}>
          Retake
        </button>
        <button className="button primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
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
