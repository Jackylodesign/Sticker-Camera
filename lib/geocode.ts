// Turns coordinates into place names with OpenStreetMap's Nominatim (server only).
// Usage policy: https://operations.osmfoundation.org/policies/nominatim/
// - identify ourselves with a User-Agent
// - at most 1 request per second, no bulk use (we only look up one sticker
//   at a time: on upload, or when its location is edited)
// Never throws: if Nominatim is slow or down, the sticker just has no names.

import type { Coords } from "./meta";

const URL_BASE = "https://nominatim.openstreetmap.org/reverse";
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
  const run = queue.then(async () => {
    const wait = lastRequest + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    return lookup(coords);
  });
  queue = run.catch(() => {});
  return run.catch(() => NO_NAMES);
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
