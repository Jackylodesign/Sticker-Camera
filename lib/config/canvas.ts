// The infinite canvas on the home page: spacing, colours and how it moves.
// Tweak freely; the page picks up the new values on the next deploy.
// Styles of the bar, About panel and sticker view: components/InfiniteCanvas.module.css.

export const CANVAS = {
  cellSize: 240, // px, width and height of one grid cell
  gap: 40, // px, space between cells
  stickerSize: 0.85, // biggest a sticker may get inside its cell (1 = fills it)
  // How far visitors can zoom in. Public copies are limited (DISPLAY_MAX_SIDE),
  // so much higher than this and they start to look soft.
  maxZoom: 2.5,
  // The same for one opened sticker. Softness is fine here: it's a closer look.
  stickerMaxZoom: 6,
  stickerTapZoom: 2.5, // how far a double tap zooms in
  background: "#0e0e0e",
  text: "#ffffff", // top bar text
  friction: 0.95, // glide after a fling: 0 = stops at once, closer to 1 = glides longer
  hoverScale: 1.06, // desktop: grow a little under the mouse (1 = off)
  // Desktop: the grid drifts a little as the mouse moves, a hint that it can
  // be dragged. Max distance in px from the resting spot (0 = off).
  drift: 40,
  driftEase: 0.06, // how quickly it follows the mouse each frame (0–1)
};
