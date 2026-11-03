// @vitest-environment jsdom
// Keyboard and screen-reader basics of the public home page.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InfiniteCanvas from "@/components/InfiniteCanvas";
import { stickerName } from "@/lib/meta";

const STICKERS = [
  { id: "a", day: "2026-10-12", area: "Mong Kok, Hong Kong" },
  { id: "b", day: "2026-10-13", area: null },
];

beforeEach(() => {
  // The grid downloads each sticker once and shows it from a blob: URL.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("png")),
  );
  URL.createObjectURL = () => "blob:sticker";
  URL.revokeObjectURL = () => {};
  HTMLImageElement.prototype.decode = async () => {}; // jsdom has no decode()
});
afterEach(cleanup);

const press = (key: string) => fireEvent.keyDown(document.activeElement!, { key });

describe("About dialog", () => {
  it("opens on arrival as a modal, with focus on Explore", () => {
    render(<InfiniteCanvas stickers={STICKERS} />);
    const dialog = screen.getByRole("dialog", { name: "About" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Explore the stickers" }));
  });

  it("keeps Tab inside the dialog", () => {
    render(<InfiniteCanvas stickers={STICKERS} />);
    const link = screen.getByRole("link", { name: /Time Capsules/ });
    const explore = screen.getByRole("button", { name: "Explore the stickers" });
    press("Tab"); // from the last item…
    expect(document.activeElement).toBe(link); // …back to the first
    fireEvent.keyDown(link, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(explore);
  });

  it("returns focus to the About button after Esc", () => {
    render(<InfiniteCanvas stickers={STICKERS} />);
    press("Escape");
    expect(screen.queryByRole("dialog")).toBeNull();

    const about = screen.getByRole("button", { name: "About" });
    about.focus();
    fireEvent.click(about);
    expect(screen.getByRole("dialog", { name: "About" })).toBeTruthy();
    press("Escape");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(about);
  });
});

describe("Canvas keyboard", () => {
  it("is focusable and says how to use it", () => {
    render(<InfiniteCanvas stickers={STICKERS} />);
    press("Escape"); // close About; focus falls back to the canvas
    const canvas = screen.getByRole("application");
    expect(canvas.getAttribute("aria-label")).toMatch(/arrow keys/);
    expect(document.activeElement).toBe(canvas);
  });

  it("Enter opens the middle sticker, Esc closes it and focus comes back", async () => {
    render(<InfiniteCanvas stickers={STICKERS} />);
    press("Escape");
    const canvas = screen.getByRole("application");
    await act(async () => press("Enter"));
    const dialog = await screen.findByRole("dialog", { name: stickerName(STICKERS[0]) });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
    press("Escape");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(canvas);
  });

  it("ArrowRight moves one cell, so Enter opens the next sticker", async () => {
    render(<InfiniteCanvas stickers={STICKERS} />);
    press("Escape");
    press("ArrowRight");
    await act(async () => press("Enter"));
    expect(await screen.findByRole("dialog", { name: stickerName(STICKERS[1]) })).toBeTruthy();
  });
});

describe("Sticker list", () => {
  it("names each sticker from its date and area", () => {
    render(<InfiniteCanvas stickers={STICKERS} />);
    const buttons = screen.getAllByRole("button", { name: /^Sticker from/, hidden: true });
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Sticker from 12 Oct 2026, Mong Kok, Hong Kong",
      "Sticker from 13 Oct 2026",
    ]);
  });

  it("opens the same dialog and returns focus to the list item", async () => {
    render(<InfiniteCanvas stickers={STICKERS} />);
    press("Escape");
    const item = screen.getByRole("button", { name: "Sticker from 13 Oct 2026" });
    item.focus();
    await act(async () => fireEvent.click(item));
    await screen.findByRole("dialog", { name: "Sticker from 13 Oct 2026" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(document.activeElement).toBe(item);
  });

  it("is reachable from the skip link", () => {
    render(<InfiniteCanvas stickers={STICKERS} />);
    press("Escape");
    fireEvent.click(screen.getByRole("link", { name: "Skip to sticker list" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Stickers" }));
  });
});
