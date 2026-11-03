"use client";

import { useState } from "react";
import type { PlaceResult } from "@/lib/geocode";
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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[] | null>(null);

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
      // Only refresh the fields this request changed, so unsaved edits in
      // the others (e.g. a new date) survive picking a place.
      const moved = "lat" in changes;
      if ("taken_at" in changes) setTaken(toLocalInput(saved.taken_at));
      if (moved || "place_name" in changes) setPlace(saved.place_name ?? "");
      if (moved || "area_name" in changes) setArea(saved.area_name ?? "");
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

  // Search runs only on Search / Enter (OpenStreetMap asks for no search-as-you-type).
  const findPlace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setBusy(true);
    setMessage("Searching…");
    try {
      const res = await fetch(`/api/places?q=${encodeURIComponent(query.trim())}`);
      if (!res.ok) throw new Error();
      const found = (await res.json()) as PlaceResult[];
      setResults(found);
      setMessage(found.length ? null : "No places found. Try another name, or add the city.");
    } catch {
      setMessage("Search didn't work. Try again in a moment.");
    }
    setBusy(false);
  };

  // Use the picked place's spot and names (names stay editable afterwards).
  const pick = (r: PlaceResult) => {
    setResults(null);
    setQuery("");
    const changes: Record<string, unknown> = { lat: r.lat, lng: r.lng };
    if (r.place_name) changes.place_name = r.place_name;
    if (r.area_name) changes.area_name = r.area_name;
    void send(changes, "Location set. Edit the names if needed, then Save details.");
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
      <form className="meta-search" onSubmit={findPlace}>
        <label>
          <span>Find a place</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Mong Kok, or a shop name"
            disabled={busy}
          />
        </label>
        <button className="button secondary" type="submit" disabled={busy || query.trim().length < 2}>
          Search
        </button>
      </form>
      {results && results.length > 0 && (
        <ul className="meta-results">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button type="button" onClick={() => pick(r)} disabled={busy}>
                <b>{r.area_name ?? r.place_name ?? r.label}</b>
                <small>{r.label}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
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
