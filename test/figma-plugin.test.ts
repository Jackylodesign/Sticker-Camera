// The Figma plugin's sticker look is generated from lib/sticker.ts.
// If this fails, run `npm run build:plugin` and commit figma-plugin/ui.html.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildUiHtml, UI_HTML } from "../scripts/build-plugin.mjs";

describe("figma-plugin/ui.html", () => {
  it("is up to date with lib/", async () => {
    const committed = readFileSync(UI_HTML, "utf8");
    expect(await buildUiHtml(committed)).toBe(committed);
  });
});
