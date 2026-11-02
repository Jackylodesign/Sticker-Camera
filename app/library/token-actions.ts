"use server";

// Owner only: make and revoke Figma plugin tokens (see lib/tokens.ts).

import { revalidatePath } from "next/cache";
import { auth, isOwner } from "@/auth";
import { sql } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/tokens";

async function assertOwner() {
  if (!isOwner((await auth())?.user?.email)) throw new Error("Not signed in");
}

/** Returns the new token. This is the only time it is ever shown. */
export async function createToken(): Promise<string> {
  await assertOwner();
  const token = generateToken();
  await sql`INSERT INTO api_tokens (token_hash, label) VALUES (${hashToken(token)}, 'Figma plugin')`;
  revalidatePath("/library");
  return token;
}

export async function revokeToken(id: string) {
  await assertOwner();
  await sql`UPDATE api_tokens SET revoked_at = now() WHERE id::text = ${id} AND revoked_at IS NULL`;
  revalidatePath("/library");
}
