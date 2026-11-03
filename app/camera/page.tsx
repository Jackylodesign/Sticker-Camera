"use client";

import { useEffect, useState } from "react";
import CameraScreen from "@/components/CameraScreen";
import LiftScreen from "@/components/LiftScreen";
import ModelStatusBar from "@/components/ModelStatusBar";
import PreviewScreen from "@/components/PreviewScreen";
import SelectScreen from "@/components/SelectScreen";
import { IS_IOS } from "@/lib/config/device";
import { cutOutSelection } from "@/lib/mask";
import {
  getForegroundAlpha,
  pageRestartedWhileBusy,
  preloadModels,
  releaseSelection,
  subscribeModelStatus,
  type ModelStatus,
} from "@/lib/models";
import type { CaptureMeta } from "@/lib/location";
import { NO_OUTBOX_MESSAGE, startAutoUpload } from "@/lib/outbox";
import { prepareSticker, type PreparedSticker } from "@/lib/sticker";

type Screen =
  | { name: "camera" }
  | { name: "lift"; photo: HTMLCanvasElement } // iPhone/iPad: Apple's "Copy Subject"
  | { name: "select"; photo: HTMLCanvasElement; error?: string } // other devices: our AI
  | { name: "processing" }
  | { name: "preview"; sticker: PreparedSticker };

export default function Home() {
  const [screen, setScreen] = useState<Screen>({ name: "camera" });
  const [modelStatus, setModelStatus] = useState<ModelStatus>({ state: "loading", loaded: 0, total: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  // When and where the current photo was taken, used at Save.
  const [meta, setMeta] = useState<CaptureMeta | undefined>(undefined);

  // Upload any stickers still waiting from last time, and again when back online.
  useEffect(() => startAutoUpload(), []);

  // Other devices: start downloading our AI models as soon as the app opens.
  // iPhone/iPad: never load them (Apple's "Copy Subject" does the cut-out).
  useEffect(() => {
    if (IS_IOS) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- IS_IOS is only known in the browser, not on the server
      setModelStatus({ state: "ready" }); // nothing to download
      return;
    }
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
    if (!IS_IOS) releaseSelection();
    setScreen({ name: "camera" });
  };

  if (screen.name === "camera") {
    return (
      <CameraScreen
        onPhoto={(photo, photoMeta) => {
          setMeta(photoMeta);
          setNotice(null);
          setScreen(IS_IOS ? { name: "lift", photo } : { name: "select", photo });
        }}
        modelStatus={modelStatus}
        notice={notice}
      />
    );
  }
  if (screen.name === "lift") {
    return (
      <LiftScreen
        photo={screen.photo}
        onSticker={(cutout) => setScreen({ name: "preview", sticker: prepareSticker(cutout) })}
        onRetake={retake}
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
  if (screen.name === "preview") {
    return (
      <PreviewScreen
        sticker={screen.sticker}
        meta={meta}
        onRetake={retake}
        onSaved={(result) => {
          retake();
          setNotice(
            result === "uploaded"
              ? `Sticker uploaded. ${NO_OUTBOX_MESSAGE}`
              : "Sticker saved. It uploads in the background. See History.",
          );
        }}
      />
    );
  }

  return (
    <main className="screen centered">
      <div className="spinner" aria-hidden />
      {modelStatus.state === "ready" ? <p>Cutting out your sticker…</p> : <ModelStatusBar status={modelStatus} />}
    </main>
  );
}
