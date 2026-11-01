"use client";

import { useEffect, useState } from "react";
import CameraScreen from "@/components/CameraScreen";
import ModelStatusBar from "@/components/ModelStatusBar";
import PreviewScreen from "@/components/PreviewScreen";
import { preloadModel, removeBackground, subscribeModelStatus, type ModelStatus } from "@/lib/removeBackground";
import { prepareSticker, type PreparedSticker } from "@/lib/sticker";

type Screen =
  | { name: "camera" }
  | { name: "processing" }
  | { name: "preview"; sticker: PreparedSticker }
  | { name: "error"; message: string };

export default function Home() {
  const [screen, setScreen] = useState<Screen>({ name: "camera" });
  const [modelStatus, setModelStatus] = useState<ModelStatus>({ state: "loading", loaded: 0, total: 0 });

  // Start downloading the model as soon as the app opens.
  useEffect(() => {
    preloadModel();
    return subscribeModelStatus(setModelStatus);
  }, []);

  const handlePhoto = async (photo: HTMLCanvasElement) => {
    setScreen({ name: "processing" });
    try {
      const cutout = await removeBackground(photo);
      setScreen({ name: "preview", sticker: prepareSticker(cutout) });
    } catch (err) {
      setScreen({ name: "error", message: String(err) });
    }
  };

  const retake = () => setScreen({ name: "camera" });

  if (screen.name === "camera") return <CameraScreen onPhoto={handlePhoto} modelStatus={modelStatus} />;
  if (screen.name === "preview") return <PreviewScreen sticker={screen.sticker} onRetake={retake} />;

  return (
    <main className="screen centered">
      {screen.name === "processing" ? (
        <>
          <div className="spinner" aria-hidden />
          {modelStatus.state === "ready" ? <p>Removing background…</p> : <ModelStatusBar status={modelStatus} />}
        </>
      ) : (
        <>
          <p>Something went wrong: {screen.message}</p>
          <button className="button primary" onClick={retake}>
            Try again
          </button>
        </>
      )}
    </main>
  );
}
