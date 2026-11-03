// Who may open what. Calls the `authorized` callback in auth.ts (which
// proxy.ts runs before every request) with fake requests.

import { describe, expect, it } from "vitest";
import "@/auth";
import { nextAuth, OWNER } from "./mocks";

type Authorized = (args: { auth: unknown; request: unknown }) => boolean | Response;
const authorized = (nextAuth.config as { callbacks: { authorized: Authorized } }).callbacks.authorized;

/** Runs the access check: "allow", "signin" (page redirect) or "401". */
function check(path: string, opts: { method?: string; email?: string | null; bearer?: boolean } = {}) {
  const headers = new Headers(opts.bearer ? { authorization: "Bearer sc_test" } : {});
  const request = { nextUrl: new URL(path, "https://stickerindex.page"), method: opts.method ?? "GET", headers };
  const result = authorized({ auth: opts.email ? { user: { email: opts.email } } : null, request });
  if (result === true) return "allow";
  if (result === false) return "signin";
  return String(result.status);
}

const PUBLIC = [
  "/",
  "/gallery",
  "/canvas",
  "/about",
  "/signin",
  "/api/auth/signin",
  "/api/auth/callback/google",
  "/api/gallery/0b7c2f2e-1111-4222-8333-444455556666/image",
  "/opengraph-image",
  "/icon.svg",
  "/apple-icon",
];

const OWNER_PAGES = ["/camera", "/library", "/library/x", "/history"];

const OWNER_APIS: [method: string, path: string][] = [
  ["GET", "/api/stickers"],
  ["POST", "/api/stickers"],
  ["PATCH", "/api/stickers/x"],
  ["DELETE", "/api/stickers/x"],
  ["GET", "/api/stickers/x/image"],
  ["GET", "/api/places?q=London"],
];

describe("signed out", () => {
  it.each(PUBLIC)("allows public %s", (path) => {
    expect(check(path)).toBe("allow");
  });

  it.each(OWNER_PAGES)("sends %s to sign-in", (path) => {
    expect(check(path)).toBe("signin");
  });

  it.each(OWNER_APIS)("answers 401 to %s %s", (method, path) => {
    expect(check(path, { method })).toBe("401");
  });
});

describe("owner", () => {
  it.each([...OWNER_PAGES, ...PUBLIC])("allows %s", (path) => {
    expect(check(path, { email: OWNER })).toBe("allow");
  });

  it.each(OWNER_APIS)("allows %s %s", (method, path) => {
    expect(check(path, { method, email: OWNER })).toBe("allow");
  });

  it("matches the email ignoring case and spaces", () => {
    expect(check("/camera", { email: "  OWNER@example.COM " })).toBe("allow");
  });
});

describe("someone else's Google account", () => {
  it.each(OWNER_PAGES)("is treated as signed out on %s", (path) => {
    expect(check(path, { email: "stranger@example.com" })).toBe("signin");
  });

  it.each(OWNER_APIS)("gets 401 on %s %s", (method, path) => {
    expect(check(path, { method, email: "stranger@example.com" })).toBe("401");
  });

  it("is not the owner when OWNER_EMAIL is unset", () => {
    const saved = process.env.OWNER_EMAIL;
    delete process.env.OWNER_EMAIL;
    try {
      expect(check("/camera", { email: OWNER })).toBe("signin");
    } finally {
      process.env.OWNER_EMAIL = saved;
    }
  });
});

describe("Figma plugin token (Authorization header, no session)", () => {
  // These reach the route, which then checks the token itself.
  it.each([
    ["GET", "/api/stickers"],
    ["GET", "/api/stickers/x/image"],
    ["DELETE", "/api/stickers/x"],
  ])("lets %s %s through to the route", (method, path) => {
    expect(check(path, { method, bearer: true })).toBe("allow");
  });

  it.each([
    ["POST", "/api/stickers"],
    ["PATCH", "/api/stickers/x"],
    ["DELETE", "/api/stickers"],
    ["GET", "/api/stickers/x"],
    ["DELETE", "/api/stickers/x/image"],
    ["GET", "/api/stickers/x/image/more"],
    ["GET", "/api/places?q=London"],
  ])("refuses %s %s with 401", (method, path) => {
    expect(check(path, { method, bearer: true })).toBe("401");
  });

  it.each(["/camera", "/library"])("does not open page %s", (path) => {
    expect(check(path, { bearer: true })).toBe("signin");
  });

  it("needs the header: no token, no entry", () => {
    expect(check("/api/stickers")).toBe("401");
  });

  it.each(["/api/stickers", "/api/stickers/x/image", "/api/stickers/x"])(
    "lets the OPTIONS preflight reach %s",
    (path) => {
      expect(check(path, { method: "OPTIONS" })).toBe("allow");
    },
  );

  it("does not let OPTIONS reach other APIs", () => {
    expect(check("/api/places", { method: "OPTIONS" })).toBe("401");
  });
});

describe("tricky paths", () => {
  it.each([
    // Exact matches only for public pages.
    ["/gallery/x", "signin"],
    ["/galleryx", "signin"],
    ["/about/x", "signin"],
    ["/signin/x", "signin"],
    ["/api/galleryx", "401"],
    ["/api/gallery", "401"],
    // URLs are normalised first, so ".." can't climb out of a public path.
    ["/opengraph-image/../api/stickers", "401"],
    ["/icon/../camera", "signin"],
    ["/api/gallery/../stickers", "401"],
    ["/api/gallery/%2e%2e/stickers", "401"],
    ["/gallery/../library", "signin"],
    // A query string doesn't change the path.
    ["/camera?next=/gallery", "signin"],
    // Paths are case sensitive (Next.js routes are too, so /Camera is a 404).
    ["/API/stickers", "signin"],
  ])("%s -> %s", (path, expected) => {
    expect(check(path)).toBe(expected);
  });

  // SURPRISING, but not a hole today: the icon / preview check is a prefix
  // match, so any path starting with these names is public. No owner page or
  // API starts with them now. Don't name a private route like this.
  it.each(["/icon-evil", "/iconography", "/apple-icon-x", "/opengraph-image-anything"])(
    "allows %s (prefix match)",
    (path) => {
      expect(check(path)).toBe("allow");
    },
  );

  // Same for /api/auth: a prefix, so /api/authx is public too. No route exists there.
  it("allows /api/authx (prefix match)", () => {
    expect(check("/api/authx")).toBe("allow");
  });
});
