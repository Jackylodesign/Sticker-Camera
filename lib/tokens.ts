// Personal API tokens for the Figma plugin. Only a SHA-256 hash of each token
// is stored, so a database leak doesn't leak working tokens.

import { createHash, randomBytes } from "node:crypto";
import { sql } from "./db";

/** A new random token, e.g. "sc_3q2…". Shown to the owner once, never stored. */
export function generateToken() {
  return "sc_" + randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** True if the token exists and isn't revoked. Also records when it was last used. */
export async function verifyToken(token: string) {
  const rows = await sql`
    UPDATE api_tokens SET last_used_at = now()
    WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL
    RETURNING id`;
  return rows.length > 0;
}
