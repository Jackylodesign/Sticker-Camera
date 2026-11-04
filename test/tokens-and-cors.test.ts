// Figma plugin tokens and CORS on the API routes that accept them.

import { beforeEach, describe, expect, it } from "vitest";
import * as list from "@/app/api/stickers/route";
import * as one from "@/app/api/stickers/[id]/route";
import * as image from "@/app/api/stickers/[id]/image/route";
import { hashToken } from "@/lib/tokens";
import { blob, dbAnswers, OWNER, queries, signedInAs } from "./mocks";
import { pngFile } from "./png";

const GOOD = "sc_good-token";
const ID = "0b7c2f2e-1111-4222-8333-444455556666";
const params = { params: Promise.resolve({ id: ID }) };

/** Fake database: knows one valid token and one sticker. */
beforeEach(() => {
  dbAnswers((q) => {
    // verifyToken: the hash must match and the token must not be revoked.
    if (q.text.startsWith("UPDATE api_tokens")) return q.values[0] === hashToken(GOOD) ? [{ id: 1 }] : [];
    if (q.text.includes("FROM stickers ORDER BY")) return [{ id: ID }];
    if (q.text.startsWith("SELECT pathname")) return [{ pathname: `stickers/${ID}.png`, display_pathname: null }];
    return [];
  });
});

function req(method: string, auth?: string) {
  return new Request(`https://stickerindex.page/api/stickers/${ID}`, {
    method,
    headers: auth ? { authorization: auth } : {},
  });
}

const tokenRoutes = [
  ["GET list", (r: Request) => list.GET(r)],
  ["GET image", (r: Request) => image.GET(r, params)],
  ["DELETE", (r: Request) => one.DELETE(r, params)],
] as const;

describe.each(tokenRoutes)("%s", (_name, call) => {
  const method = _name.split(" ")[0];

  it("works with a valid token", async () => {
    const res = await call(req(method, `Bearer ${GOOD}`));
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("accepts a lower-case 'bearer'", async () => {
    expect((await call(req(method, `bearer ${GOOD}`))).status).toBeLessThan(300);
  });

  it.each(["Bearer sc_wrong", "Bearer revoked", "Bearer", "Basic abc", "", `Bearer ${GOOD} extra`])(
    "refuses header %j with 401",
    async (header) => {
      const res = await call(req(method, header));
      expect(res.status).toBe(401);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    },
  );

  it("refuses a bad token even when the owner is signed in", async () => {
    signedInAs(OWNER);
    expect((await call(req(method, "Bearer sc_wrong"))).status).toBe(401);
  });

  it("refuses no token and no session", async () => {
    expect((await call(req(method))).status).toBe(401);
  });

  it("works for the owner without a token", async () => {
    signedInAs(OWNER);
    expect((await call(req(method))).status).toBeLessThan(300);
  });
});

describe("token on owner-only routes", () => {
  it("PATCH refuses a valid token", async () => {
    const res = await one.PATCH(
      new Request("https://x/api/stickers/" + ID, {
        method: "PATCH",
        headers: { authorization: `Bearer ${GOOD}`, "content-type": "application/json" },
        body: JSON.stringify({ place_name: "x" }),
      }),
      params,
    );
    expect(res.status).toBe(401);
    expect(queries.some((q) => q.text.startsWith("UPDATE stickers"))).toBe(false);
  });
});

describe("upload with a token (iPhone app)", () => {
  function upload(auth: string) {
    const body = new FormData();
    body.append("id", ID);
    body.append("file", pngFile());
    return list.POST(
      new Request("https://stickerindex.page/api/stickers", { method: "POST", headers: { authorization: auth }, body }),
    );
  }

  it("saves the sticker with a valid token", async () => {
    const res = await upload(`Bearer ${GOOD}`);
    expect(res.status).toBe(201);
    expect(blob.put).toHaveBeenCalledOnce();
    expect(queries.some((q) => q.text.startsWith("INSERT INTO stickers"))).toBe(true);
  });

  it("refuses a wrong token, even when signed in as the owner", async () => {
    signedInAs(OWNER);
    const res = await upload("Bearer sc_wrong");
    expect(res.status).toBe(401);
    expect(blob.put).not.toHaveBeenCalled();
  });

  it("is not open to other websites: no CORS header", async () => {
    const res = await upload(`Bearer ${GOOD}`);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("DELETE", () => {
  it("removes both files and the row", async () => {
    dbAnswers((q) => {
      if (q.text.startsWith("UPDATE api_tokens")) return [{ id: 1 }];
      if (q.text.startsWith("SELECT pathname"))
        return [{ pathname: "stickers/a.png", display_pathname: "display/a.png" }];
      return [];
    });
    const res = await one.DELETE(req("DELETE", `Bearer ${GOOD}`), params);
    expect(res.status).toBe(204);
    expect(blob.del).toHaveBeenCalledWith(["stickers/a.png", "display/a.png"]);
    expect(queries.at(-1)?.text).toMatch(/^DELETE FROM stickers/);
  });

  it("is 404 for an unknown sticker", async () => {
    dbAnswers((q) => (q.text.startsWith("UPDATE api_tokens") ? [{ id: 1 }] : []));
    expect((await one.DELETE(req("DELETE", `Bearer ${GOOD}`), params)).status).toBe(404);
    expect(blob.del).not.toHaveBeenCalled();
  });
});

describe("CORS preflight", () => {
  it.each([
    ["list", list.OPTIONS, "GET"],
    ["image", image.OPTIONS, "GET"],
    ["one sticker", one.OPTIONS, "DELETE"],
  ])("%s allows only %s, never credentials", (_name, options, methods) => {
    const res = options();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe(methods);
    expect(res.headers.get("access-control-allow-headers")).toBe("Authorization");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });
});
