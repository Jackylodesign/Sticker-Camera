// Types for build-plugin.mjs, so the tests can import it.

export const UI_HTML: string;
export function bundleStickerStyle(): Promise<string>;
export function buildUiHtml(html?: string): Promise<string>;
