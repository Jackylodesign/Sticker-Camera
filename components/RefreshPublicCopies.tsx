"use client";

// Owner only (shown in the Library): makes the public copy of every public
// sticker again, with the current settings (e.g. no watermark). Runs in the
// owner's browser, one sticker at a time, like "Make public" does.

import { useState } from "react";
import { makeDisplayImage } from "@/lib/display";
import { errorMessage } from "@/lib/outbox";
import { releaseCanvas } from "@/lib/photo";
import { prepareSticker, renderSticker } from "@/lib/sticker";

export default function RefreshPublicCopies({ ids }: { ids: string[] }) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!confirm(`Make the public copies of ${ids.length} stickers again? They'll all get the white border and shadow.`)) return;
    setBusy(true);
    let failed = 0;
    for (const [n, id] of ids.entries()) {
      setStatus(`Refreshing ${n + 1} of ${ids.length}…`);
      try {
        await refreshOne(id);
      } catch (err) {
        failed++;
        console.error(id, errorMessage(err));
      }
    }
    setStatus(failed ? `Done, but ${failed} failed. Try again.` : "Done.");
    setBusy(false);
  };

  return (
    <>
      <button className="link-button" onClick={run} disabled={busy}>
        Refresh public copies
      </button>
      {status && <span className="refresh-status">{status}</span>}
    </>
  );
}

async function refreshOne(id: string) {
  const res = await fetch(`/api/stickers/${id}/image`);
  if (!res.ok) throw new Error(`Couldn't load (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());
  const cutout = document.createElement("canvas");
  cutout.width = bitmap.width;
  cutout.height = bitmap.height;
  cutout.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  const prepared = prepareSticker(cutout);
  const styled = renderSticker(prepared, { border: true, shadow: true });
  const display = await makeDisplayImage(styled);
  for (const c of [cutout, styled, prepared.subject, prepared.border]) releaseCanvas(c);

  // Same call as "Make public": the server swaps in the new copy.
  const form = new FormData();
  form.append("is_public", "true");
  form.append("display", display, "display.png");
  const patch = await fetch(`/api/stickers/${id}`, { method: "PATCH", body: form });
  if (!patch.ok) throw new Error(`Server error ${patch.status}`);
}
