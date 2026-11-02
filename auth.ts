// Sign-in setup (Auth.js). Only the owner's Google account may sign in.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

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
      // The public gallery and its watermarked images are open to everyone.
      if (pathname === "/gallery" || pathname.startsWith("/api/gallery/")) return true;
      if (isOwner(auth?.user?.email)) return true;
      // APIs answer "401" instead of redirecting to the sign-in page.
      if (pathname.startsWith("/api/")) {
        return Response.json({ error: "Not signed in" }, { status: 401 });
      }
      return false; // pages: go to /signin
    },
  },
});
