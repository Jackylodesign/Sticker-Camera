// Nominatim place names. fetch is always faked: no real requests.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fresh module each test, so the 1-per-second queue starts empty.
let geo: typeof import("@/lib/geocode");
beforeEach(async () => {
  vi.resetModules();
  geo = await import("@/lib/geocode");
});
afterEach(() => vi.useRealTimers());

// Shaped like real Nominatim jsonv2 answers (trimmed).
const HONG_KONG = {
  name: "Langham Place",
  address: {
    road: "Argyle Street",
    suburb: "Mong Kok",
    city_district: "Yau Tsim Mong District",
    city: "Hong Kong",
    country: "China",
    country_code: "cn",
  },
};
const HONG_KONG_HK = {
  name: "",
  address: {
    road: "Nathan Road",
    neighbourhood: "Tsim Sha Tsui",
    city: "Kowloon",
    country: "Hong Kong",
    country_code: "hk",
  },
};
const LONDON = {
  name: "",
  address: {
    road: "Oxford Street",
    neighbourhood: "Soho",
    suburb: "Westminster",
    city: "London",
    state: "England",
    country: "United Kingdom",
    country_code: "gb",
  },
};
const VILLAGE = {
  name: "",
  address: { road: "The Street", village: "Castle Combe", county: "Wiltshire", state: "England", country_code: "gb" },
};

describe("namesFrom", () => {
  it("Hong Kong (country_code cn, city Hong Kong)", () => {
    expect(geo.namesFrom(HONG_KONG)).toEqual({
      place_name: "Langham Place, Mong Kok, Hong Kong",
      area_name: "Mong Kok, Hong Kong",
    });
  });

  it("Hong Kong as a city-state (country_code hk) says Hong Kong, not Kowloon", () => {
    expect(geo.namesFrom(HONG_KONG_HK)).toEqual({
      place_name: "Nathan Road, Tsim Sha Tsui, Hong Kong",
      area_name: "Tsim Sha Tsui, Hong Kong",
    });
  });

  it("London: neighbourhood for the place, the coarser suburb for the area", () => {
    expect(geo.namesFrom(LONDON)).toEqual({
      place_name: "Oxford Street, Soho, London",
      area_name: "Westminster, London",
    });
  });

  it("a village", () => {
    expect(geo.namesFrom(VILLAGE)).toEqual({ place_name: "The Street, Castle Combe", area_name: "Castle Combe" });
  });

  it.each([HONG_KONG, HONG_KONG_HK, LONDON, VILLAGE])("area never names the street or spot (%#)", (data) => {
    const area = geo.namesFrom(data).area_name ?? "";
    for (const detail of [data.name, data.address.road].filter(Boolean)) expect(area).not.toContain(detail);
  });

  it("no address: no names", () => {
    expect(geo.namesFrom(null)).toEqual({ place_name: null, area_name: null });
    expect(geo.namesFrom({ name: "x" })).toEqual({ place_name: null, area_name: null });
    expect(geo.namesFrom({ address: {} })).toEqual({ place_name: null, area_name: null });
  });

  it("doesn't repeat a name", () => {
    expect(geo.namesFrom({ name: "London", address: { city: "London" } })).toEqual({
      place_name: "London",
      area_name: "London",
    });
  });
});

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("reverseGeocode", () => {
  it("asks Nominatim politely and returns the names", async () => {
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => ok(LONDON));
    vi.stubGlobal("fetch", fetch);
    expect(await geo.reverseGeocode({ lat: 51.5, lng: -0.13 })).toMatchObject({ area_name: "Westminster, London" });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toMatch(/^https:\/\/nominatim\.openstreetmap\.org\/reverse\?/);
    expect(url).toContain("lat=51.5&lon=-0.13");
    expect((init?.headers as Record<string, string>)["User-Agent"]).toMatch(/^StickerIndex\//);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
    ["a timeout", () => Promise.reject(new DOMException("timed out", "TimeoutError"))],
    ["a 500", async () => new Response("oops", { status: 500 })],
    ["broken JSON", async () => new Response("{", { status: 200 })],
  ])("never throws on %s: no names", async (_name, impl) => {
    vi.stubGlobal("fetch", vi.fn(impl));
    await expect(geo.reverseGeocode({ lat: 1, lng: 2 })).resolves.toEqual({ place_name: null, area_name: null });
  });

  it("sends at most one request every 1.1 seconds", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const times: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        times.push(Date.now());
        return ok(LONDON);
      }),
    );
    const all = Promise.all([1, 2, 3].map((i) => geo.reverseGeocode({ lat: i, lng: i })));
    await vi.advanceTimersByTimeAsync(5000);
    await all;
    expect(times).toHaveLength(3);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(1100);
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(1100);
  });

  it("keeps the queue going after a failure", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const fetch = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(ok(LONDON));
    vi.stubGlobal("fetch", fetch);
    const first = geo.reverseGeocode({ lat: 1, lng: 1 });
    const second = geo.reverseGeocode({ lat: 2, lng: 2 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await first).toEqual({ place_name: null, area_name: null });
    expect(await second).toMatchObject({ area_name: "Westminster, London" });
  });
});

describe("searchPlaces", () => {
  it("returns places with numbers for lat/lng, dropping broken ones", async () => {
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
      ok([
        { lat: "51.5", lon: "-0.13", display_name: "Soho, London", ...LONDON },
        { lat: "nope", lon: "1", display_name: "Broken" },
      ]),
    );
    vi.stubGlobal("fetch", fetch);
    const results = await geo.searchPlaces("Soho London");
    expect(results).toEqual([
      {
        lat: 51.5,
        lng: -0.13,
        label: "Soho, London",
        place_name: "Oxford Street, Soho, London",
        area_name: "Westminster, London",
      },
    ]);
    expect(fetch.mock.calls[0][0]).toContain("q=Soho%20London");
  });

  it.each([
    ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
    ["a timeout", () => Promise.reject(new DOMException("timed out", "TimeoutError"))],
    ["a 429", async () => new Response("slow down", { status: 429 })],
  ])("returns [] on %s", async (_name, impl) => {
    vi.stubGlobal("fetch", vi.fn(impl));
    await expect(geo.searchPlaces("x")).resolves.toEqual([]);
  });
});
