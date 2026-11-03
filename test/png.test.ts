import { describe, expect, it } from "vitest";
import { readPngSize } from "@/lib/png";
import { pngBytes } from "./png";

describe("readPngSize", () => {
  it("reads width and height", () => {
    expect(readPngSize(pngBytes(600, 400))).toEqual({ width: 600, height: 400 });
  });

  it("reads big sizes (unsigned)", () => {
    expect(readPngSize(pngBytes(0xffffffff, 1))).toEqual({ width: 0xffffffff, height: 1 });
  });

  it("works on a view into a bigger buffer", () => {
    const big = new Uint8Array(100);
    big.set(pngBytes(7, 9), 10);
    expect(readPngSize(big.subarray(10))).toEqual({ width: 7, height: 9 });
  });

  it("rejects a wrong signature", () => {
    const bytes = pngBytes(10, 10);
    bytes[1] = 0x51;
    expect(readPngSize(bytes)).toBeNull();
  });

  it("rejects too few bytes", () => {
    expect(readPngSize(pngBytes(10, 10).slice(0, 23))).toBeNull();
    expect(readPngSize(new Uint8Array())).toBeNull();
  });

  it.each([
    [0, 10],
    [10, 0],
  ])("rejects a %ix%i image", (w, h) => {
    expect(readPngSize(pngBytes(w, h))).toBeNull();
  });

  it("rejects a JPEG", () => {
    expect(readPngSize(new Uint8Array(30).fill(0xff))).toBeNull();
  });
});
