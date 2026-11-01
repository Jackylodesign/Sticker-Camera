// Every API route calls this first. proxy.ts already blocks signed-out
// requests, but checking again here means an API can never be open by mistake.

import { auth, isOwner } from "@/auth";

/** Returns a 401 response if the caller isn't the owner, otherwise null. */
export async function requireOwner(): Promise<Response | null> {
  const session = await auth();
  if (isOwner(session?.user?.email)) return null;
  return Response.json({ error: "Not signed in" }, { status: 401 });
}
