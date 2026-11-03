// Turns coordinates into place names with OpenStreetMap's Nominatim (server only).
// Usage policy: https://operations.osmfoundation.org/policies/nominatim/
// - identify ourselves with a User-Agent
// - at most 1 request per second, no bulk use (we only look up one sticker
//   at a time: on upload, or when its location is edited)
// - no search-as-you-type: place search runs only when the owner presses Search
// Never throws: if Nominatim is slow or down, the sticker just has no names.

import type { Coords } from "./meta";

const URL_BASE = "https://nominatim.openstreetmap.org/reverse";
const SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "StickerIndex/1.0 (+https://stickerindex.page)";
const TIMEOUT_MS = 3000;
const MIN_GAP_MS = 1100; // a little over 1 second between requests

export type PlaceNames = {
  place_name: string | null; // detailed, owner only
  area_name: string | null; // coarse, may be shown publicly
};

const NO_NAMES: PlaceNames = { place_name: null, area_name: null };

// Requests wait their turn, so this server never sends two within a second.
let queue: Promise<unknown> = Promise.resolve();
let lastRequest = 0;

export function reverseGeocode(coords: Coords): Promise<PlaceNames> {
  return inTurn(() => lookup(coords)).catch(() => NO_NAMES);
}

export type PlaceResult = Coords & PlaceNames & { label: string };

/** Finds places by name (e.g. "Mong Kok"). Up to 5 results; [] on any failure. */
export function searchPlaces(query: string): Promise<PlaceResult[]> {
  return inTurn(() => search(query)).catch(() => []);
}

// Runs one Nominatim request at a time, at least MIN_GAP_MS apart.
function inTurn<T>(request: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequest + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    return request();
  });
  queue = run.catch(() => {});
  return run;
}

async function search(query: string): Promise<PlaceResult[]> {
  const url = `${SEARCH_URL}?format=jsonv2&q=${encodeURIComponent(query)}&limit=5&addressdetails=1&accept-language=en`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Referer: "https://stickerindex.page" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    lat: string;
    lon: string;
    display_name?: string;
    name?: string;
    address?: Address;
  }[];
  return data
    .map((d) => ({ lat: Number(d.lat), lng: Number(d.lon), label: d.display_name ?? d.name ?? "", ...namesFrom(d) }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

async function lookup({ lat, lng }: Coords): Promise<PlaceNames> {
  const url = `${URL_BASE}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1&accept-language=en`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Referer: "https://stickerindex.page" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) return NO_NAMES;
  return namesFrom(await res.json());
}

type Address = Record<string, string | undefined>;

/** Picks the two names out of a Nominatim jsonv2 answer. */
export function namesFrom(data: { name?: string; address?: Address } | null): PlaceNames {
  const a = data?.address;
  if (!a) return NO_NAMES;
  // City-states: "Hong Kong" reads better than "Kowloon".
  const cityState = ["hk", "mo", "sg"].includes(a.country_code ?? "") ? a.country : undefined;
  const city = cityState ?? a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? a.state ?? a.country;
  const local = a.neighbourhood ?? a.suburb ?? a.quarter ?? a.city_district;
  const district = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district; // coarser first
  const spot = data?.name || a.road || a.pedestrian;

  return {
    place_name: join([spot, local, city]),
    // Never street level: only a district and the city (or country).
    area_name: join([district, city]),
  };
}

function join(parts: (string | undefined)[]): string | null {
  const out: string[] = [];
  for (const p of parts) if (p && !out.includes(p)) out.push(p);
  return out.length ? out.join(", ") : null;
}
