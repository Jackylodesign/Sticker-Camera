"use client";

import { useEffect, useRef, useState } from "react";
import { prepareSelection, selectObject, type ModelStatus, type SelectPoint } from "@/lib/models";
import { releaseCanvas } from "@/lib/photo";
import ModelStatusBar from "./ModelStatusBar";

type Mode = "select" | "add" | "remove";

export default function SelectScreen({
  photo,
  initialError,
  modelStatus,
  onDone,
  onRetake,
}: {
  photo: HTMLCanvasElement;
  initialError?: string;
  modelStatus: ModelStatus;
  onDone: (mask: Uint8Array) => void;
  onRetake: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [photoId, setPhotoId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("select");
  const [points, setPoints] = useState<SelectPoint[]>([]);
  const [mask, setMask] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [attempt, setAttempt] = useState(0); // bump to retry preparing the photo
  const [prepareFailed, setPrepareFailed] = useState(false);
  const latest = useRef(0); // ignore answers to taps that were replaced by newer taps

  // Let SAM "read" the photo once. After that, each tap is quick.
  useEffect(() => {
    let cancelled = false;
    prepareSelection(photo)
      .then((id) => !cancelled && setPhotoId(id))
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
        setPrepareFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [photo, attempt]);

  // Ask SAM for a new mask whenever the taps change.
  useEffect(() => {
    if (photoId === null || points.length === 0) return;
    const run = ++latest.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- shows the spinner while the worker answers
    setBusy(true);
    selectObject(photoId, points)
      .then((m) => {
        if (run !== latest.current) return;
        setMask(m.some((v) => v) ? m : null);
        setError(m.some((v) => v) ? null : "Nothing found there. Try tapping the middle of the object.");
      })
      .catch((e) => run === latest.current && setError(String(e)))
      .finally(() => run === latest.current && setBusy(false));
  }, [photoId, points]);

  // Draw the photo, darken everything that isn't selected, and mark the taps.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const { width: w, height: h } = photo;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(photo, 0, 0);
    if (mask) {
      const shade = ctx.createImageData(w, h);
      for (let i = 0; i < mask.length; i++) if (!mask[i]) shade.data[i * 4 + 3] = 150; // black, ~60% opaque
      const layer = document.createElement("canvas");
      layer.width = w;
      layer.height = h;
      layer.getContext("2d")!.putImageData(shade, 0, 0);
      ctx.drawImage(layer, 0, 0); // drawImage (unlike putImageData) blends on top
      releaseCanvas(layer);
    }
    const r = Math.max(w, h) * 0.012;
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = p.include ? "#34c759" : "#ff3b30";
      ctx.fill();
      ctx.lineWidth = r * 0.3;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
    }
  }, [photo, mask, points]);

  const ready = photoId !== null;

  const onTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ready) return;
    // Convert the tap from screen position to photo pixels.
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * photo.width;
    const y = ((e.clientY - rect.top) / rect.height) * photo.height;
    if (mode === "select") setPoints([{ x, y, include: true }]);
    else if (mode === "add") setPoints((p) => [...p, { x, y, include: true }]);
    else if (points.length > 0) setPoints((p) => [...p, { x, y, include: false }]);
  };

  let hint = "Tap the object";
  if (!ready) hint = "Getting the photo ready…";
  else if (busy) hint = "Finding the object…";
  else if (mode === "add") hint = "Tap more parts to add them";
  else if (mode === "remove") hint = points.length ? "Tap areas to remove (like a hand)" : "Tap the object first";

  return (
    <main className="screen select">
      <p className="hint" aria-live="polite">
        {hint}
      </p>
      <div className="select-area">
        {/* Touch or mouse only: there is no keyboard way to pick a spot yet. */}
        <canvas
          ref={canvasRef}
          onPointerDown={onTap}
          className={ready ? undefined : "waiting"}
          role="img"
          aria-label="Your photo. Tap the object to select it."
        />
      </div>

      {!ready && <ModelStatusBar status={modelStatus} />}
      {error && (
        <p className="select-error" role="alert">
          {error}{" "}
          {prepareFailed && (
            <button
              className="link"
              onClick={() => (setError(null), setPrepareFailed(false), setAttempt((a) => a + 1))}
            >
              Try again
            </button>
          )}
        </p>
      )}

      <div className="modes" role="radiogroup" aria-label="Tap mode">
        {(
          [
            ["select", "Select"],
            ["add", "+ Add"],
            ["remove", "− Remove"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            role="radio"
            aria-checked={mode === m}
            className={mode === m ? "on" : undefined}
            onClick={() => setMode(m)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="controls two">
        <button className="button secondary" onClick={onRetake}>
          Retake
        </button>
        <button className="button primary" onClick={() => mask && onDone(mask)} disabled={!mask || busy}>
          Use this
        </button>
      </div>
    </main>
  );
}
