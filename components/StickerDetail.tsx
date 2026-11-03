"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Toggle } from "@/components/PreviewScreen";
import { makeDisplayImage } from "@/lib/display";
import { errorMessage } from "@/lib/outbox";
import { releaseCanvas } from "@/lib/photo";
import { canvasToPngBlob, prepareSticker, renderSticker, type PreparedSticker, type StickerStyle } from "@/lib/sticker";

export default function StickerDetail({ id, initialPublic }: { id: string; initialPublic: boolean }) {
  const router = useRouter();
  const [sticker, setSticker] = useState<PreparedSticker | null>(null);
  const [style, setStyle] = useState<StickerStyle>({ border: true, shadow: true });
  const [url, setUrl] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rendered = useRef<HTMLCanvasElement | null>(null);

  // Load the clean cutout from the server once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/stickers/${id}/image`);
      if (!res.ok) throw new Error(`Couldn't load the sticker (${res.status})`);
      const bitmap = await createImageBitmap(await res.blob());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
      bitmap.close();
      const prepared = prepareSticker(canvas);
      releaseCanvas(canvas);
      if (!cancelled) setSticker(prepared);
    })().catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Re-draw whenever a toggle changes (same as the camera's preview).
  useEffect(() => {
    if (!sticker) return;
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

  const download = async () => {
    if (!rendered.current) return;
    const blob = await canvasToPngBlob(rendered.current);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sticker-${id.slice(0, 8)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // Public: the gallery gets a small copy in the style shown now.
  const togglePublic = async () => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("is_public", String(!isPublic));
      if (!isPublic) {
        if (!rendered.current) throw new Error("The sticker hasn't loaded yet.");
        form.append("display", await makeDisplayImage(rendered.current), "display.png");
      }
      const res = await fetch(`/api/stickers/${id}`, { method: "PATCH", body: form });
      if (!res.ok) throw new Error(await errorText(res));
      setIsPublic(!isPublic);
      router.refresh();
    } catch (err) {
      setError(`Couldn't change it: ${errorMessage(err)}`);
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!confirm("Delete this sticker for good? This can't be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/stickers/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(await errorText(res));
      router.replace("/library");
      router.refresh();
    } catch (err) {
      setError(`Couldn't delete: ${errorMessage(err)}`);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="checkerboard">
        {/* eslint-disable-next-line @next/next/no-img-element -- in-memory blob URL; next/image can't load it */}
        {url ? <img src={url} alt="Sticker" /> : !error && <div className="spinner" aria-hidden />}
      </div>

      <div className="toggles">
        <Toggle label="White border" on={style.border} onChange={(border) => setStyle((s) => ({ ...s, border }))} />
        <Toggle label="Shadow" on={style.shadow} onChange={(shadow) => setStyle((s) => ({ ...s, shadow }))} />
        <p className="public-note">
          {isPublic ? "Public: shown in the Gallery and Canvas as a small copy." : "Private: only you can see it."}
        </p>
      </div>

      {error && (
        <p className="select-error" role="alert">
          {error}
        </p>
      )}

      <div className="controls detail-controls">
        <button className="button primary" onClick={download} disabled={!url || busy}>
          Download PNG
        </button>
        <button className="button secondary" onClick={togglePublic} disabled={!url || busy}>
          {isPublic ? "Make private" : "Make public"}
        </button>
        <button className="button secondary danger" onClick={remove} disabled={busy}>
          Delete
        </button>
      </div>
    </>
  );
}

async function errorText(res: Response) {
  const body = await res.json().catch(() => null);
  return body?.error ?? `Server error ${res.status}`;
}
