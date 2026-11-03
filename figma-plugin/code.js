// Sticker Index plugin: main thread (runs inside Figma, no network here).
// The window (ui.html) does the fetching and styling, then sends us PNG bytes.
// Plain JavaScript on purpose: no build step needed.

// Old name kept on purpose: renaming it would forget the saved token.
var TOKEN_KEY = "stickerCameraToken";
var MAX_SIDE = 400; // inserted stickers are at most this big (longer side), in px
var GAP = 24; // space between stickers added together, in px

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
    // One sticker, or several (msg.items) laid out in a grid.
    try {
      var items = msg.items || [{ bytes: msg.bytes, width: msg.width, height: msg.height }];
      insertStickers(items);
      figma.ui.postMessage({ type: "inserted", count: items.length });
    } catch (err) {
      figma.ui.postMessage({ type: "insert-failed", message: String(err && err.message ? err.message : err) });
    }
  }
};

function insertStickers(items) {
  var rects = items.map(function (item) {
    return makeStickerRect(item.bytes, item.width, item.height);
  });

  // Lay them out in rows, roughly square: 1 → 1 column, 4 → 2, 9 → 3…
  var columns = Math.ceil(Math.sqrt(rects.length));
  var positions = [];
  var blockWidth = 0;
  var y = 0;
  for (var start = 0; start < rects.length; start += columns) {
    var row = rects.slice(start, start + columns);
    var x = 0;
    var rowHeight = 0;
    for (var i = 0; i < row.length; i++) {
      positions.push({ x: x, y: y });
      x += row[i].width + GAP;
      rowHeight = Math.max(rowHeight, row[i].height);
    }
    blockWidth = Math.max(blockWidth, x - GAP);
    y += rowHeight + GAP;
  }
  var blockHeight = y - GAP;

  // Next to the selection if there is one, else in the middle of the view.
  var box = selectionBounds();
  var originX, originY;
  if (box) {
    originX = box.x + box.width + GAP;
    originY = box.y;
  } else {
    var c = figma.viewport.center;
    originX = Math.round(c.x - blockWidth / 2);
    originY = Math.round(c.y - blockHeight / 2);
  }

  for (var j = 0; j < rects.length; j++) {
    rects[j].x = originX + positions[j].x;
    rects[j].y = originY + positions[j].y;
    figma.currentPage.appendChild(rects[j]);
  }
  figma.currentPage.selection = rects;
  figma.viewport.scrollAndZoomIntoView(rects);
}

// A rectangle filled with the sticker at its natural size, scaled down so the
// longer side is at most MAX_SIDE.
function makeStickerRect(bytes, width, height) {
  var image = figma.createImage(bytes);
  var scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  var rect = figma.createRectangle();
  rect.name = "Sticker";
  rect.resize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  rect.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
  return rect;
}

// Bounding box (page coordinates) around everything selected, or null.
function selectionBounds() {
  var nodes = figma.currentPage.selection;
  var minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
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
