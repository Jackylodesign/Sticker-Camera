"use client";

import { useEffect, useRef, useState } from "react";
import { captureVideoFrame, loadImageFile } from "@/lib/photo";
import type { ModelStatus } from "@/lib/models";
import ModelStatusBar from "./ModelStatusBar";

type Facing = "environment" | "user"; // rear / front camera

export default function CameraScreen({
  onPhoto,
  modelStatus,
  notice,
}: {
  onPhoto: (photo: HTMLCanvasElement) => void;
  modelStatus: ModelStatus;
  notice?: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Start the camera, and stop it again when we leave this screen or switch
  // cameras (otherwise the camera light stays on).
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setReady(false);
    setCameraError(null);

    // The camera is only available on secure pages (https:// or localhost).
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera isn't available here. Open the app over https:// (or use “Choose from library”).");
      return;
    }

    // The first time, the browser shows its own "Allow camera?" prompt.
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1920 } },
        audio: false,
      })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        const video = videoRef.current!;
        video.srcObject = s;
        return video.play();
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setCameraError(
          err.name === "NotAllowedError"
            ? "Camera access was blocked. Allow it in your browser settings, or use “Choose from library”."
            : `Couldn't start the camera (${err.name || err.message}).`,
        );
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  const shoot = () => {
    const video = videoRef.current;
    if (video && video.videoWidth) onPhoto(captureVideoFrame(video));
  };

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets you pick the same file twice in a row
    if (file) onPhoto(await loadImageFile(file));
  };

  return (
    <main className="screen camera">
      <div className="viewfinder">
        {/* playsInline + muted are required for live video on iPhone. */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          onLoadedMetadata={() => setReady(true)}
          className={facing === "user" ? "mirrored" : undefined}
        />
        {cameraError && <p className="camera-error">{cameraError}</p>}
      </div>

      {notice && <p className="notice">{notice}</p>}
      <ModelStatusBar status={modelStatus} />

      <div className="controls">
        <label className="button secondary">
          Choose from library
          <input type="file" accept="image/*" onChange={pickFile} hidden />
        </label>
        <button className="shutter" onClick={shoot} disabled={!ready} aria-label="Take photo" />
        <button
          className="button secondary"
          onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
          disabled={!!cameraError}
        >
          Switch camera
        </button>
      </div>
    </main>
  );
}
