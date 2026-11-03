// Date and location of a sticker: checks shared by the upload and edit APIs.

export type Coords = { lat: number; lng: number };

const MIN_DATE = Date.UTC(1990, 0, 1);
const DAY = 24 * 60 * 60 * 1000;
export const MAX_NAME_LENGTH = 200;

/** A Date from an ISO string, or null if it's missing, broken or out of range. */
export function parseTakenAt(value: unknown): Date | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const date = new Date(value);
  const t = date.getTime();
  if (!Number.isFinite(t) || t < MIN_DATE || t > Date.now() + DAY) return null;
  return date;
}

/** Valid coordinates, or null. Both must be given and in range. */
export function parseCoords(lat: unknown, lng: unknown): Coords | null {
  const a = typeof lat === "string" && lat.trim() !== "" ? Number(lat) : lat;
  const b = typeof lng === "string" && lng.trim() !== "" ? Number(lng) : lng;
  if (typeof a !== "number" || typeof b !== "number") return null;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a < -90 || a > 90 || b < -180 || b > 180) return null;
  return { lat: a, lng: b };
}

/** A trimmed place name, null for empty. undefined if it isn't a string. */
export function parseName(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const name = value.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
  return name === "" ? null : name;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-12" -> "12 Oct 2026". No time zones involved. */
export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "Sticker from 12 Oct 2026, Mong Kok, Hong Kong": a public sticker's accessible name. */
export function stickerName(s: { day: string; area: string | null }): string {
  return `Sticker from ${[formatDay(s.day), s.area].filter(Boolean).join(", ")}`;
}
