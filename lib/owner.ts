// Every API route calls this first. proxy.ts already blocks signed-out
// requests, but checking again here means an API can never be open by mistake.

import { auth, isOwner } from "@/auth";
import { verifyToken } from "./tokens";

/** Returns a 401 response if the caller isn't the owner, otherwise null. */
export async function requireOwner(): Promise<Response | null> {
  const session = await auth();
  if (isOwner(session?.user?.email)) return null;
  return Response.json({ error: "Not signed in" }, { status: 401 });
}

/**
 * Like requireOwner, but also accepts "Authorization: Bearer <token>" (the
 * Figma plugin and iPhone app). If that header is sent, only the token counts, not cookies.
 * Use only on the routes listed in isTokenRoute (lib/cors.ts).
 */
export async function requireOwnerOrToken(request: Request): Promise<Response | null> {
  const header = request.headers.get("authorization");
  if (header === null) return requireOwner();
  const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1];
  if (token && (await verifyToken(token))) return null;
  return Response.json({ error: "Invalid or revoked token" }, { status: 401 });
}
