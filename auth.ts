// Sign-in setup (Auth.js). Only the owner's Google account may sign in.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isTokenRoute } from "@/lib/cors";

/** True only for the one allowed email (from the OWNER_EMAIL env var). */
export function isOwner(email: string | null | undefined) {
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  return !!owner && !!email && email.trim().toLowerCase() === owner;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    // Refuse every Google account except the owner's (and only if Google
    // has verified that email).
    signIn({ profile }) {
      return profile?.email_verified === true && isOwner(profile.email);
    },
    // Used by proxy.ts: who may open pages and /api routes.
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname === "/signin" || pathname.startsWith("/api/auth")) return true;
      // The public gallery, canvas and their small images are open to everyone.
      if (pathname === "/gallery" || pathname === "/canvas" || pathname.startsWith("/api/gallery/")) return true;
      if (isOwner(auth?.user?.email)) return true;
      // Figma plugin: a few APIs accept a token instead. Let those requests
      // (and their CORS preflight) reach the route, which checks the token.
      if (
        isTokenRoute(request.method, pathname) &&
        (request.method === "OPTIONS" || request.headers.has("authorization"))
      ) {
        return true;
      }
      // APIs answer "401" instead of redirecting to the sign-in page.
      if (pathname.startsWith("/api/")) {
        return Response.json({ error: "Not signed in" }, { status: 401 });
      }
      return false; // pages: go to /signin
    },
  },
});
