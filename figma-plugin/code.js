// Sticker Camera plugin: main thread (runs inside Figma, no network here).
// The window (ui.html) does the fetching and styling, then sends us PNG bytes.
// Plain JavaScript on purpose: no build step needed.

var TOKEN_KEY = "stickerCameraToken";
var MAX_SIDE = 400; // inserted stickers are at most this big (longer side), in px

figma.showUI(__html__, { width: 360, height: 540, themeColors: true });

figma.ui.onmessage = function (msg) {
  if (msg.type === "get-token") {
    figma.clientStorage.getAsync(TOKEN_KEY).then(function (token) {
      figma.ui.postMessage({ type: "token", token: token || null });
    });
  } else if (msg.type === "save-token") {
    figma.clientStorage.setAsync(TOKEN_KEY, msg.token);
  } else if (msg.type === "clear-token") {
    figma.clientStorage.deleteAsync(TOKEN_KEY);
  } else if (msg.type === "insert") {
    try {
      insertSticker(msg.bytes, msg.width, msg.height);
      figma.ui.postMessage({ type: "inserted" });
    } catch (err) {
      figma.ui.postMessage({ type: "insert-failed", message: String(err && err.message ? err.message : err) });
    }
  }
};

function insertSticker(bytes, width, height) {
  var image = figma.createImage(bytes);

  // Natural size, scaled down so the longer side is at most MAX_SIDE.
  var scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  var w = Math.max(1, Math.round(width * scale));
  var h = Math.max(1, Math.round(height * scale));

  var rect = figma.createRectangle();
  rect.name = "Sticker";
  rect.resize(w, h);
  rect.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];

  // Next to the selection if there is one, else in the middle of the view.
  var box = selectionBounds();
  if (box) {
    rect.x = box.x + box.width + 24;
    rect.y = box.y;
  } else {
    var c = figma.viewport.center;
    rect.x = Math.round(c.x - w / 2);
    rect.y = Math.round(c.y - h / 2);
  }
  figma.currentPage.appendChild(rect);
  figma.currentPage.selection = [rect];
  figma.viewport.scrollAndZoomIntoView([rect]);
}

// Bounding box (page coordinates) around everything selected, or null.
function selectionBounds() {
  var nodes = figma.currentPage.selection;
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (var i = 0; i < nodes.length; i++) {
    var b = nodes[i].absoluteBoundingBox;
    if (!b) continue;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
