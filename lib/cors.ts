// CORS for the few routes the Figma plugin calls. The plugin's window has no
// web address (its Origin is "null"), so we allow any origin. No cookies are
// ever allowed cross-origin (no Allow-Credentials), so only the
// "Authorization: Bearer" token can unlock these routes from another origin.

export function withCors(res: Response) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  return res;
}

/** Answer to the browser's OPTIONS "may I?" request (preflight). */
export function preflight(methods: string) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": "Authorization",
      "Access-Control-Max-Age": "600",
    },
  });
}

/**
 * The only requests that may use a token instead of the owner's sign-in:
 * list stickers, get an image (thumb or original), delete a sticker.
 * OPTIONS (preflight) is included so the browser can ask first.
 * Used by proxy.ts (via auth.ts) to let these through to the route, which
 * then checks the token itself.
 */
export function isTokenRoute(method: string, pathname: string) {
  if (pathname === "/api/stickers") return method === "GET" || method === "OPTIONS";
  if (/^\/api\/stickers\/[^/]+\/image$/.test(pathname)) return method === "GET" || method === "OPTIONS";
  if (/^\/api\/stickers\/[^/]+$/.test(pathname)) return method === "DELETE" || method === "OPTIONS";
  return false;
}
