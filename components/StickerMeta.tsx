"use client";

import { useState } from "react";
import { currentPosition } from "@/lib/location";
import { errorMessage } from "@/lib/outbox";

export type Meta = {
  taken_at: string | null; // ISO
  lat: number | null;
  lng: number | null;
  place_name: string | null;
  area_name: string | null;
};

// Owner only (Library detail): when and where a sticker was taken.
// The exact spot and place name stay private; only the date and area are public.
export default function StickerMeta({ id, initial }: { id: string; initial: Meta }) {
  const [meta, setMeta] = useState(initial);
  const [taken, setTaken] = useState(toLocalInput(initial.taken_at));
  const [place, setPlace] = useState(initial.place_name ?? "");
  const [area, setArea] = useState(initial.area_name ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const send = async (changes: Record<string, unknown>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/stickers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Server error ${res.status}`);
      const saved = body as Meta;
      setMeta(saved);
      setTaken(toLocalInput(saved.taken_at));
      setPlace(saved.place_name ?? "");
      setArea(saved.area_name ?? "");
      setMessage(done);
    } catch (err) {
      setMessage(`Couldn't save: ${errorMessage(err)}`);
    }
    setBusy(false);
  };

  const save = () => {
    const changes: Record<string, unknown> = { place_name: place, area_name: area };
    if (taken) changes.taken_at = new Date(taken).toISOString(); // the input is in local time
    void send(changes, "Saved.");
  };

  const useHere = async () => {
    setBusy(true);
    setMessage("Finding your location…");
    const coords = await currentPosition();
    if (!coords) {
      setBusy(false);
      setMessage("Couldn't get your location. Is it allowed for this site in Settings?");
      return;
    }
    await send(coords, "Location set. Names were filled in; edit them if needed.");
  };

  const clear = () => {
    if (confirm("Remove the location and place names from this sticker?")) {
      void send({ lat: null, lng: null }, "Location cleared.");
    }
  };

  const hasCoords = meta.lat != null && meta.lng != null;

  return (
    <section className="sticker-meta">
      <label>
        <span>Date and time</span>
        <input type="datetime-local" value={taken} onChange={(e) => setTaken(e.target.value)} disabled={busy} />
      </label>
      <label>
        <span>Place (only you)</span>
        <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Sai Yeung Choi Street, Mong Kok" disabled={busy} />
      </label>
      <label>
        <span>Area (shown publicly)</span>
        <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Mong Kok, Hong Kong" disabled={busy} />
      </label>

      <p className="meta-coords">
        {hasCoords ? (
          <a href={`https://www.openstreetmap.org/?mlat=${meta.lat}&mlon=${meta.lng}#map=17/${meta.lat}/${meta.lng}`} target="_blank" rel="noreferrer">
            {meta.lat!.toFixed(5)}, {meta.lng!.toFixed(5)}
          </a>
        ) : (
          <b>No location</b>
        )}
      </p>

      <div className="meta-actions">
        <button className="button primary" onClick={save} disabled={busy}>
          Save details
        </button>
        <button className="button secondary" onClick={useHere} disabled={busy}>
          Use my current location
        </button>
        {(hasCoords || meta.place_name || meta.area_name) && (
          <button className="button secondary danger" onClick={clear} disabled={busy}>
            Clear location
          </button>
        )}
      </div>
      {message && <p className="meta-message">{message}</p>}
    </section>
  );
}

/** ISO -> "2026-10-12T14:35" in this device's time zone, for <input type="datetime-local">. */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
