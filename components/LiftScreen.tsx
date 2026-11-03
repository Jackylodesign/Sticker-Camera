"use client";

import { useEffect, useState } from "react";
import { canvasToPngBlob } from "@/lib/sticker";
import styles from "./LiftScreen.module.css";

/**
 * iPhone / iPad only. Instead of our own AI, we use Apple's built-in subject
 * lifting: the photo is shown as a normal <img>, so touching and holding it
 * brings up iOS's own menu with "Copy Subject". Then "Paste sticker" reads the
 * cut-out (a transparent PNG) back from the clipboard.
 *
 * The photo is never saved anywhere: the <img> points at an in-memory blob.
 */
export default function LiftScreen({
  photo,
  onSticker,
  onRetake,
}: {
  photo: HTMLCanvasElement;
  onSticker: (cutout: HTMLCanvasElement) => void;
  onRetake: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Turn the in-memory photo into an image URL that only this page can see.
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    canvasToPngBlob(photo).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo]);

  const paste = async () => {
    setError(null);
    // Safari only allows reading the clipboard straight from a tap, so
    // clipboard.read() must be the first await in this handler. iOS shows its
    // own small "Paste" bubble to confirm.
    let items: ClipboardItems;
    try {
      items = await navigator.clipboard.read();
    } catch {
      setError("Couldn't read the clipboard. Tap Paste sticker again and choose “Paste” in the bubble.");
      return;
    }
    setBusy(true);
    try {
      const item =
        items.find((i) => i.types.includes("image/png")) ??
        items.find((i) => i.types.some((t) => t.startsWith("image/")));
      if (!item) {
        setError("No image on the clipboard yet. Touch and hold the object, tap Copy Subject, then try again.");
        return;
      }
      const type = item.types.includes("image/png") ? "image/png" : item.types.find((t) => t.startsWith("image/"))!;
      const bitmap = await createImageBitmap(await item.getType(type));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
      bitmap.close();

      // A real "Copy Subject" result has a transparent background. If there is
      // no transparency at all, something else was copied (e.g. the whole photo).
      if (!hasTransparency(canvas)) {
        setError(
          "That image has no transparent background. Make sure you tap “Copy Subject” (not “Copy”), then paste again.",
        );
        return;
      }
      onSticker(canvas);
    } catch (e) {
      setError(`Couldn't use the pasted image: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="screen">
      <p className="hint">Touch and hold the object, then tap Copy Subject</p>
      <div className={styles.area}>
        {/* A plain <img> so iOS offers "Copy Subject" on a long press. Don't add
            touch-callout/user-select/pointer-events blocking here or on parents. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- in-memory blob URL; next/image can't load it */}
        {url && <img src={url} alt="Your capture" />}
      </div>
      <ol className={styles.steps}>
        <li>Touch and hold the thing you want until it glows</li>
        <li>
          Tap <b>Copy Subject</b>
        </li>
        <li>
          Tap <b>Paste sticker</b> below, then <b>Paste</b>
        </li>
      </ol>
      {error && (
        <p className="select-error" role="alert">
          {error}
        </p>
      )}
      <div className="controls two">
        <button className="button secondary" onClick={onRetake}>
          Retake
        </button>
        <button className="button primary" onClick={paste} disabled={busy}>
          Paste sticker
        </button>
      </div>
    </main>
  );
}

function hasTransparency(canvas: HTMLCanvasElement) {
  const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  return false;
}
