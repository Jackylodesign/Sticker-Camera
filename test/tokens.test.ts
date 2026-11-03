import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isTokenRoute } from "@/lib/cors";
import { generateToken, hashToken, verifyToken } from "@/lib/tokens";
import { dbAnswers, queries } from "./mocks";

describe("generateToken", () => {
  it("looks like sc_ + 43 url-safe characters (32 random bytes)", () => {
    expect(generateToken()).toMatch(/^sc_[A-Za-z0-9_-]{43}$/);
  });

  it("is different every time", () => {
    const tokens = new Set(Array.from({ length: 50 }, generateToken));
    expect(tokens.size).toBe(50);
  });
});

describe("hashToken", () => {
  it("is the SHA-256 hex of the token", () => {
    expect(hashToken("sc_abc")).toBe(createHash("sha256").update("sc_abc").digest("hex"));
    expect(hashToken("sc_abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("verifyToken", () => {
  it("looks up the hash, never the token itself", async () => {
    await verifyToken("sc_secret");
    const [q] = queries;
    expect(q.values).toEqual([hashToken("sc_secret")]);
    expect(JSON.stringify(q)).not.toContain("sc_secret");
  });

  it("ignores revoked tokens and records last use", async () => {
    await verifyToken("sc_x");
    expect(queries[0].text).toContain("WHERE token_hash = ? AND revoked_at IS NULL");
    expect(queries[0].text).toContain("SET last_used_at = now()");
  });

  it("is true when a row matches", async () => {
    dbAnswers(() => [{ id: 1 }]);
    expect(await verifyToken("sc_x")).toBe(true);
  });

  it("is false when nothing matches (wrong or revoked)", async () => {
    dbAnswers(() => []);
    expect(await verifyToken("sc_x")).toBe(false);
  });
});

describe("isTokenRoute", () => {
  it.each([
    ["GET", "/api/stickers"],
    ["OPTIONS", "/api/stickers"],
    ["GET", "/api/stickers/abc/image"],
    ["OPTIONS", "/api/stickers/abc/image"],
    ["DELETE", "/api/stickers/abc"],
    ["OPTIONS", "/api/stickers/abc"],
  ])("%s %s: yes", (method, path) => {
    expect(isTokenRoute(method, path)).toBe(true);
  });

  it.each([
    ["POST", "/api/stickers"],
    ["DELETE", "/api/stickers"],
    ["PATCH", "/api/stickers/abc"],
    ["GET", "/api/stickers/abc"],
    ["POST", "/api/stickers/abc/image"],
    ["DELETE", "/api/stickers/abc/image"],
    ["GET", "/api/stickers/"],
    ["GET", "/api/stickers//image"],
    ["GET", "/api/stickers/a/b/image"],
    ["GET", "/api/stickers/abc/image/"],
    ["GET", "/api/stickersx"],
    ["GET", "/api/places"],
    ["GET", "/library"],
    ["get", "/api/stickers"], // methods are upper case
  ])("%s %s: no", (method, path) => {
    expect(isTokenRoute(method, path)).toBe(false);
  });
});
