"use client";

import { useEffect, useState } from "react";
import CameraScreen from "@/components/CameraScreen";
import ModelStatusBar from "@/components/ModelStatusBar";
import PreviewScreen from "@/components/PreviewScreen";
import SelectScreen from "@/components/SelectScreen";
import { cutOutSelection } from "@/lib/mask";
import {
  getForegroundAlpha,
  pageRestartedWhileBusy,
  preloadModels,
  releaseSelection,
  subscribeModelStatus,
  type ModelStatus,
} from "@/lib/models";
import { prepareSticker, type PreparedSticker } from "@/lib/sticker";

type Screen =
  | { name: "camera" }
  | { name: "select"; photo: HTMLCanvasElement; error?: string }
  | { name: "processing" }
  | { name: "preview"; sticker: PreparedSticker };

export default function Home() {
  const [screen, setScreen] = useState<Screen>({ name: "camera" });
  const [modelStatus, setModelStatus] = useState<ModelStatus>({ state: "loading", loaded: 0, total: 0 });
  const [notice, setNotice] = useState<string | null>(null);

  // Start downloading the models as soon as the app opens.
  useEffect(() => {
    if (pageRestartedWhileBusy()) {
      setNotice("The page restarted while making your sticker (the phone ran low on memory). Please try again.");
    }
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
      // Keep the photo: go back to the tap screen and say what went wrong.
      setScreen({ name: "select", photo, error: `Couldn't make the sticker: ${String(err)}` });
    }
  };

  const retake = () => {
    releaseSelection();
    setScreen({ name: "camera" });
  };

  if (screen.name === "camera") {
    return (
      <CameraScreen
        onPhoto={(photo) => {
          setNotice(null);
          setScreen({ name: "select", photo });
        }}
        modelStatus={modelStatus}
        notice={notice}
      />
    );
  }
  if (screen.name === "select") {
    const { photo } = screen;
    return (
      <SelectScreen
        photo={photo}
        initialError={screen.error}
        modelStatus={modelStatus}
        onDone={(mask) => handleSelected(photo, mask)}
        onRetake={retake}
      />
    );
  }
  if (screen.name === "preview") return <PreviewScreen sticker={screen.sticker} onRetake={retake} />;

  return (
    <main className="screen centered">
      <div className="spinner" aria-hidden />
      {modelStatus.state === "ready" ? <p>Cutting out your sticker…</p> : <ModelStatusBar status={modelStatus} />}
    </main>
  );
}
