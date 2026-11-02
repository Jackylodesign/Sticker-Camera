// Runs before every page and API request: signed-out visitors are sent to
// /signin (pages) or get a 401 (API). /gallery and /canvas are the public exceptions;
// a few APIs also let Figma plugin token requests through to the route.
// See `authorized` in auth.ts.
export { auth as proxy } from "@/auth";

export const config = {
  // Everything except Next's own static files and the icon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
