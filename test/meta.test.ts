import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDay, MAX_NAME_LENGTH, parseCoords, parseName, parseTakenAt } from "@/lib/meta";

describe("parseTakenAt", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date("2026-11-03T12:00:00Z") }));
  afterEach(() => vi.useRealTimers());

  it.each([
    ["2026-10-12T08:00:00Z", "2026-10-12T08:00:00.000Z"],
    ["2026-10-12T16:00:00+08:00", "2026-10-12T08:00:00.000Z"],
    ["1990-01-01T00:00:00Z", "1990-01-01T00:00:00.000Z"], // earliest allowed
    ["2026-11-04T12:00:00Z", "2026-11-04T12:00:00.000Z"], // up to a day ahead (clock skew)
  ])("accepts %s", (input, iso) => {
    expect(parseTakenAt(input)?.toISOString()).toBe(iso);
  });

  it.each([
    ["before 1990", "1989-12-31T23:59:59Z"],
    ["over a day ahead", "2026-11-04T12:00:01Z"],
    ["not a date", "yesterday"],
    ["empty", ""],
    ["too long", "2026-10-12T08:00:00Z" + " ".repeat(21)],
    ["a number", 1760256000000],
    ["null", null],
    ["undefined", undefined],
  ])("rejects %s", (_name, input) => {
    expect(parseTakenAt(input)).toBeNull();
  });
});

describe("parseCoords", () => {
  it.each([
    [22.3, 114.17],
    ["22.3", "114.17"],
    [" 51.5 ", "-0.12"],
    [0, 0],
    [90, 180],
    [-90, -180],
  ])("accepts %j, %j", (lat, lng) => {
    expect(parseCoords(lat, lng)).toEqual({ lat: Number(lat), lng: Number(lng) });
  });

  it.each([
    [90.0001, 0],
    [-90.0001, 0],
    [0, 180.0001],
    [0, -180.0001],
    ["", "1"],
    ["  ", "1"],
    ["abc", "1"],
    [NaN, 1],
    [Infinity, 1],
    [null, 1],
    [1, undefined],
    [true, 1],
    [[1], 1],
  ])("rejects %j, %j", (lat, lng) => {
    expect(parseCoords(lat, lng)).toBeNull();
  });
});

describe("parseName", () => {
  it("tidies spaces", () => expect(parseName("  Mong   Kok\n ")).toBe("Mong Kok"));
  it("turns empty into null", () => expect(parseName("   ")).toBeNull());
  it("keeps null", () => expect(parseName(null)).toBeNull());
  it("caps the length", () => expect(parseName("a".repeat(500))).toHaveLength(MAX_NAME_LENGTH));
  it.each([5, {}, [], undefined, true])("rejects %j", (v) => expect(parseName(v)).toBeUndefined());
});

describe("formatDay", () => {
  it.each([
    ["2026-10-12", "12 Oct 2026"],
    ["2026-01-01", "1 Jan 2026"],
    ["1999-12-31", "31 Dec 1999"],
  ])("%s -> %s", (day, out) => expect(formatDay(day)).toBe(out));

  it.each(["", "not a day", "2026-10"])("leaves %j as it is", (day) => expect(formatDay(day)).toBe(day));
});
