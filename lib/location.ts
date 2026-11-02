// Browser side: where and when a photo was taken.

import { parseCoords, parseTakenAt, type Coords } from "./meta";

/** What we know about a photo when it's taken or picked. */
export type CaptureMeta = {
  takenAt?: number; // ms since 1970; missing = use the save time
  position: Promise<Coords | null>;
};

const GIVE_UP_MS = 15000; // includes time spent on the "Allow location?" prompt

/**
 * The phone's location, or null if it's denied, off, or too slow. Never
 * rejects, and nothing waits on it at the shutter: it's only needed at Save.
 * The first call shows the browser's own "Allow location?" prompt.
 */
export function currentPosition(): Promise<Coords | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), GIVE_UP_MS);
    const done = (coords: Coords | null) => {
      clearTimeout(timer);
      resolve(coords);
    };
    navigator.geolocation.getCurrentPosition(
      (p) => done({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => done(null),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 2 * 60 * 1000 },
    );
  });
}

/** True if the browser hasn't asked for location yet (so we show a hint). */
export async function locationNotAskedYet(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state === "prompt";
  } catch {
    return false; // can't tell: no hint
  }
}

/**
 * Date and GPS from a picked photo's EXIF, read before it's drawn to a canvas
 * (drawing strips EXIF). The parser is only downloaded for this.
 */
export async function readPhotoMeta(file: File): Promise<CaptureMeta> {
  try {
    const exifr = (await import("exifr")).default;
    const tags = await exifr.parse(file, {
      pick: ["DateTimeOriginal", "CreateDate", "GPSLatitude", "GPSLongitude", "GPSLatitudeRef", "GPSLongitudeRef"],
    });
    // Same checks as the server, so a photo with a wrong clock or broken GPS
    // still uploads (just without that value).
    const date: unknown = tags?.DateTimeOriginal ?? tags?.CreateDate;
    const takenAt = date instanceof Date ? parseTakenAt(date.toISOString())?.getTime() : undefined;
    const { latitude, longitude } = tags ?? {};
    const coords = latitude || longitude ? parseCoords(latitude, longitude) : null;
    return { takenAt, position: Promise.resolve(coords) };
  } catch {
    return { position: Promise.resolve(null) };
  }
}
