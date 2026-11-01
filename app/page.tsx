"use client";

import { useEffect, useState } from "react";
import CameraScreen from "@/components/CameraScreen";
import ModelStatusBar from "@/components/ModelStatusBar";
import PreviewScreen from "@/components/PreviewScreen";
import SelectScreen from "@/components/SelectScreen";
import { cutOutSelection } from "@/lib/mask";
import { getForegroundAlpha, preloadModels, subscribeModelStatus, type ModelStatus } from "@/lib/models";
import { prepareSticker, type PreparedSticker } from "@/lib/sticker";

type Screen =
  | { name: "camera" }
  | { name: "select"; photo: HTMLCanvasElement }
  | { name: "processing" }
  | { name: "preview"; sticker: PreparedSticker }
  | { name: "error"; message: string };

export default function Home() {
  const [screen, setScreen] = useState<Screen>({ name: "camera" });
  const [modelStatus, setModelStatus] = useState<ModelStatus>({ state: "loading", loaded: 0, total: 0 });

  // Start downloading the models as soon as the app opens.
  useEffect(() => {
    preloadModels();
    return subscribeModelStatus(setModelStatus);
  }, []);

  const handleSelected = async (photo: HTMLCanvasElement, samMask: Uint8Array) => {
    setScreen({ name: "processing" });
    try {
      const rmbgAlpha = await getForegroundAlpha(photo);
      const cutout = cutOutSelection(photo, rmbgAlpha, samMask);
      setScreen({ name: "preview", sticker: prepareSticker(cutout) });
    } catch (err) {
      setScreen({ name: "error", message: String(err) });
    }
  };

  const retake = () => setScreen({ name: "camera" });

  if (screen.name === "camera") {
    return <CameraScreen onPhoto={(photo) => setScreen({ name: "select", photo })} modelStatus={modelStatus} />;
  }
  if (screen.name === "select") {
    const { photo } = screen;
    return (
      <SelectScreen
        photo={photo}
        modelStatus={modelStatus}
        onDone={(mask) => handleSelected(photo, mask)}
        onRetake={retake}
      />
    );
  }
  if (screen.name === "preview") return <PreviewScreen sticker={screen.sticker} onRetake={retake} />;

  return (
    <main className="screen centered">
      {screen.name === "processing" ? (
        <>
          <div className="spinner" aria-hidden />
          {modelStatus.state === "ready" ? <p>Cutting out your sticker…</p> : <ModelStatusBar status={modelStatus} />}
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
