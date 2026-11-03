// Security headers from next.config.ts.

import { describe, expect, it } from "vitest";
// @ts-expect-error: Next's bundled copy has no types.
import { pathToRegexp } from "next/dist/compiled/path-to-regexp";
import nextConfig from "@/next.config";

/** The headers Next would send for `path`, using each rule's `source` pattern. */
async function headersFor(path: string) {
  const rules = (await nextConfig.headers?.()) ?? [];
  const out = new Map<string, string>();
  for (const rule of rules) {
    if (!(pathToRegexp(rule.source, [], {}) as RegExp).test(path)) continue;
    for (const h of rule.headers) out.set(h.key.toLowerCase(), h.value);
  }
  return out;
}

const PATHS = ["/", "/camera", "/signin", "/api/stickers", "/api/auth/signin", "/opengraph-image", "/icon.svg"];

describe.each(PATHS)("%s", (path) => {
  it("sends the security headers", async () => {
    const h = await headersFor(path);
    expect(h.get("x-robots-tag")).toBe("noindex, nofollow, noimageindex");
    expect(h.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(h.get("x-content-type-options")).toBe("nosniff");
    expect(h.get("x-frame-options")).toBe("DENY");
    expect(h.get("strict-transport-security")).toBe("max-age=63072000");
  });
});

describe("Permissions-Policy", () => {
  it("allows camera, location and clipboard on our own pages only", async () => {
    const policy = (await headersFor("/")).get("permissions-policy")!.split(", ");
    for (const f of ["camera", "geolocation", "clipboard-read", "clipboard-write"]) {
      expect(policy).toContain(`${f}=(self)`);
    }
  });

  it("turns off what the app never uses", async () => {
    const policy = (await headersFor("/")).get("permissions-policy")!.split(", ");
    for (const f of ["microphone", "payment", "usb"]) expect(policy).toContain(`${f}=()`);
  });
});

describe("Content-Security-Policy", () => {
  it("is report-only for now (warns, never blocks)", async () => {
    const h = await headersFor("/");
    expect(h.has("content-security-policy")).toBe(false);
    expect(h.get("content-security-policy-report-only")).toBeTruthy();
  });

  it("allows what the app needs and no more", async () => {
    const csp = (await headersFor("/")).get("content-security-policy-report-only")!;
    const dir = Object.fromEntries(
      csp.split("; ").map((d) => {
        const [name, ...values] = d.split(" ");
        return [name, values];
      }),
    );
    expect(dir["default-src"]).toEqual(["'self'"]);
    expect(dir["script-src"]).toContain("'wasm-unsafe-eval'");
    expect(dir["script-src"]).not.toContain("'unsafe-eval'"); // only in `next dev`
    expect(dir["img-src"]).toEqual(["'self'", "blob:", "data:"]);
    expect(dir["worker-src"]).toEqual(["'self'", "blob:"]);
    expect(dir["connect-src"]).toContain("https://huggingface.co");
    expect(dir["form-action"]).toContain("https://accounts.google.com");
    expect(dir["frame-ancestors"]).toEqual(["'none'"]);
    expect(dir["object-src"]).toEqual(["'none'"]);
  });
});
