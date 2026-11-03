"use client";

import { useEffect, useRef, useState } from "react";
import type { CaptureMeta } from "@/lib/location";
import { errorMessage, saveSticker } from "@/lib/outbox";
import { canvasToPngBlob, renderSticker, type PreparedSticker, type StickerStyle } from "@/lib/sticker";
import styles from "./PreviewScreen.module.css";

export default function PreviewScreen({
  sticker,
  meta,
  onRetake,
  onSaved,
}: {
  sticker: PreparedSticker;
  meta?: CaptureMeta;
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
      onSaved(await saveSticker(sticker.subject, meta));
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
    <main className="screen">
      <div className={styles.checkerboard}>
        {/* eslint-disable-next-line @next/next/no-img-element -- in-memory blob URL; next/image can't load it */}
        {url && <img src={url} alt="Sticker preview" />}
      </div>

      <div className={styles.toggles}>
        <Toggle label="White border" on={style.border} onChange={(border) => setStyle((s) => ({ ...s, border }))} />
        <Toggle label="Shadow" on={style.shadow} onChange={(shadow) => setStyle((s) => ({ ...s, shadow }))} />
        <button className={`link ${styles.download}`} onClick={download}>
          Download this preview
        </button>
      </div>

      {error && (
        <p className="select-error" role="alert">
          {error}
        </p>
      )}

      <div className="controls two">
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

export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className={styles.toggle}>
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
