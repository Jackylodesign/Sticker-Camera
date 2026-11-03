// The smallest bytes our PNG check accepts: signature + the IHDR size fields.
export function pngBytes(width: number, height: number, extra = 0): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33 + extra);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); // IHDR length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

export function pngFile(width = 100, height = 100, extra = 0) {
  return new File([pngBytes(width, height, extra)], "s.png", { type: "image/png" });
}
