// The Sticker Index mark: a sticker with its corner peeling up.
// One drawing for the top bar, favicon, iPhone icon and share card.
// app/icon.svg is a static file with the same paths (a test checks they match).
export const LOGO_VIEWBOX = "0 0 24 24";

export const LOGO_PATHS = [
  // sheet, with the top-right corner cut off
  "M14 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-8",
  // the corner folded back
  "M14 3v4a3 3 0 0 0 3 3h4z",
];
