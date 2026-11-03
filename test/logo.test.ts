// app/icon.svg is a static file, so it can't import lib/logo.ts. Check it
// draws the same mark.

import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { LOGO_PATHS } from "@/lib/logo";

it("app/icon.svg uses the paths from lib/logo.ts", () => {
  const svg = readFileSync(new URL("../app/icon.svg", import.meta.url), "utf8");
  const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
  expect(paths).toEqual(LOGO_PATHS);
});
