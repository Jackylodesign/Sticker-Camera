"use client";

// An endless grid of stickers you can drag in any direction.
// - The set of stickers repeats forever in both directions (modulo maths).
// - Only the cells around the screen exist in the page. When a cell scrolls
//   off one edge, the same element is reused for the cell coming in on the
//   other edge.
// - One requestAnimationFrame loop moves everything with translate3d. It only
//   runs while something is moving.
// - On desktop the grid drifts slightly with the mouse, hinting it can be dragged.
// - The grid stays hidden until the stickers on screen have loaded, then fades
//   in all at once (no empty frames while loading).
// Sizes, colours and friction: CANVAS in lib/constants.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import LogoMark from "@/components/LogoMark";
import { ABOUT, CANVAS } from "@/lib/constants";
import type { PublicSticker } from "@/lib/db";
import { formatDay } from "@/lib/meta";

type Cell = { el: HTMLDivElement; img: HTMLImageElement; index: number };

const FRAME = 1000 / 60; // ms
const TAP_SLOP = 6; // px a pointer may move and still count as a tap
const REVEAL_TIMEOUT = 5000; // ms: show the grid anyway if images are this slow

export default function InfiniteCanvas({ stickers }: { stickers: PublicSticker[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ids = useMemo(() => stickers.map((s) => s.id), [stickers]);
  const [opened, setOpened] = useState<{ url: string; index: number } | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);

  // /about sends people here with ?about, which opens the panel straight away.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("about")) setAboutOpen(true);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || ids.length === 0) return;

    const n = ids.length;
    const pitch = CANVAS.cellSize + CANVAS.gap;
    // Which sticker goes in cell (col, row). Each row starts further along the
    // list, so the next row down doesn't repeat the one above.
    const cols = Math.ceil(Math.sqrt(n));
    const shift = cols % n === 0 ? cols + 1 : cols;
    const indexAt = (c: number, r: number) => mod(c + r * shift, n);

    // Each sticker is downloaded once and kept in memory. (The image route
    // says "no-store", so setting img.src again would download it again.)
    const urls = new Map<number, Promise<string>>();
    const created: string[] = [];
    const urlFor = (i: number) => {
      let url = urls.get(i);
      if (!url) {
        url = fetch(`/api/gallery/${ids[i]}/image`)
          .then((res) => (res.ok ? res.blob() : Promise.reject()))
          .then((blob) => {
            const u = URL.createObjectURL(blob);
            created.push(u);
            return u;
          })
          .catch(() => "");
        urls.set(i, url);
      }
      return url;
    };

    // ---------- cells ----------
    let pool: Cell[] = [];
    let poolCols = 0;
    let poolRows = 0;
    let ox = 0; // pan offset, px
    let oy = 0;
    let dx = 0; // mouse drift on top of the pan offset, px
    let dy = 0;
    let driftX = 0; // where the drift is heading
    let driftY = 0;

    const buildPool = () => {
      for (const cell of pool) cell.el.remove();
      // One spare column/row on each side, so swaps happen off screen.
      poolCols = Math.ceil(root.clientWidth / pitch) + 2;
      poolRows = Math.ceil(root.clientHeight / pitch) + 2;
      pool = Array.from({ length: poolCols * poolRows }, () => {
        const el = document.createElement("div");
        el.className = "canvas-cell";
        const img = document.createElement("img");
        img.alt = "";
        img.draggable = false;
        el.appendChild(img);
        root.appendChild(el);
        return { el, img, index: -1 };
      });
    };

    const render = () => {
      const c0 = Math.floor(-(ox + dx) / pitch) - 1;
      const r0 = Math.floor(-(oy + dy) / pitch) - 1;
      for (let r = r0; r < r0 + poolRows; r++) {
        for (let c = c0; c < c0 + poolCols; c++) {
          const cell = pool[mod(r, poolRows) * poolCols + mod(c, poolCols)];
          const x = c * pitch + ox + dx + CANVAS.gap / 2;
          const y = r * pitch + oy + dy + CANVAS.gap / 2;
          cell.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
          const i = indexAt(c, r);
          if (cell.index !== i) {
            cell.index = i;
            urlFor(i).then((u) => {
              if (cell.index !== i) return;
              if (u) cell.img.src = u;
              else cell.img.removeAttribute("src");
            });
          }
        }
      }
    };

    // ---------- animation loop ----------
    let raf = 0;
    let lastTime = 0;
    let dragging = false;
    let vx = 0; // px per ms
    let vy = 0;

    const tick = (time: number) => {
      const dt = lastTime ? Math.min(time - lastTime, 50) : FRAME;
      lastTime = time;
      if (!dragging && (vx || vy)) {
        ox += vx * dt;
        oy += vy * dt;
        const k = Math.pow(CANVAS.friction, dt / FRAME);
        vx *= k;
        vy *= k;
        if (Math.hypot(vx, vy) < 0.01) vx = vy = 0;
      }
      // Ease the drift towards where the mouse points.
      const ease = 1 - Math.pow(1 - CANVAS.driftEase, dt / FRAME);
      dx += (driftX - dx) * ease;
      dy += (driftY - dy) * ease;
      const drifting = Math.abs(driftX - dx) > 0.1 || Math.abs(driftY - dy) > 0.1;
      if (!drifting) {
        dx = driftX;
        dy = driftY;
      }
      render();
      if (dragging || vx || vy || drifting) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
        lastTime = 0;
      }
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    // ---------- drag (mouse + touch) ----------
    let pointerId = -1;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let moved = false;
    let samples: { x: number; y: number; t: number }[] = [];

    const onDown = (e: PointerEvent) => {
      if (pointerId !== -1 || (e.pointerType === "mouse" && e.button !== 0)) return; // one finger at a time
      pointerId = e.pointerId;
      root.setPointerCapture(pointerId);
      dragging = true;
      moved = false;
      vx = vy = 0;
      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
      samples = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
      wake();
    };
    // Mouse hovering (not dragging): drift away from the pointer, as if
    // leaning towards what's on that side.
    const onHover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || dragging || !CANVAS.drift) return;
      const nx = (e.clientX / root.clientWidth) * 2 - 1; // -1 left … 1 right
      const ny = (e.clientY / root.clientHeight) * 2 - 1;
      driftX = -nx * CANVAS.drift;
      driftY = -ny * CANVAS.drift;
      wake();
    };
    const onLeave = () => {
      driftX = driftY = 0;
      wake();
    };

    const onMove = (e: PointerEvent) => {
      onHover(e);
      if (e.pointerId !== pointerId) return;
      ox += e.clientX - lastX;
      oy += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) > TAP_SLOP) {
        moved = true;
        root.classList.add("is-dragging");
      }
      samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      samples = samples.filter((s) => e.timeStamp - s.t < 100);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      pointerId = -1;
      dragging = false;
      root.classList.remove("is-dragging");
      // Fling speed = movement over the last ~100ms, unless the finger
      // stopped before letting go.
      const recent = samples.filter((s) => e.timeStamp - s.t < 100);
      const first = recent[0];
      const last = recent[recent.length - 1];
      if (e.type === "pointerup" && first && last && last.t > first.t && e.timeStamp - last.t < 50) {
        vx = (last.x - first.x) / (last.t - first.t);
        vy = (last.y - first.y) / (last.t - first.t);
      }
      wake();
    };

    // ---------- trackpad / mouse wheel ----------
    // The trackpad already glides on its own, so no extra momentum here.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // no page scroll, no pinch zoom
      if (e.ctrlKey) return; // pinch gesture
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? root.clientHeight : 1;
      ox -= e.deltaX * unit;
      oy -= e.deltaY * unit;
      vx = vy = 0;
      wake();
    };

    // ---------- tap / click: open one sticker ----------
    const onClick = (e: MouseEvent) => {
      if (moved) return;
      const px = e.clientX - ox - dx - CANVAS.gap / 2;
      const py = e.clientY - oy - dy - CANVAS.gap / 2;
      const c = Math.floor(px / pitch);
      const r = Math.floor(py / pitch);
      // Ignore taps in the gap between cells.
      if (px - c * pitch > CANVAS.cellSize || py - r * pitch > CANVAS.cellSize) return;
      const i = indexAt(c, r);
      urlFor(i).then((u) => u && setOpened({ url: u, index: i }));
    };

    const onResize = () => {
      buildPool();
      render();
    };
    const noMenu = (e: Event) => e.preventDefault();

    // Start with sticker 0 in the middle of the screen.
    ox = (root.clientWidth - pitch) / 2;
    oy = (root.clientHeight - pitch) / 2;
    buildPool();
    render();

    // Reveal once the stickers on screen are downloaded and decoded, or after
    // REVEAL_TIMEOUT so a slow image never keeps the page blank.
    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      root.classList.add("is-ready");
    };
    const onScreen = [...new Set(pool.map((cell) => cell.index))];
    Promise.all(onScreen.map((i) => urlFor(i)))
      .then(() => new Promise((r) => requestAnimationFrame(r))) // let the src be set
      .then(() => Promise.all(pool.map((cell) => (cell.img.src ? cell.img.decode().catch(() => {}) : null))))
      .then(reveal);
    const revealTimer = setTimeout(reveal, REVEAL_TIMEOUT);

    root.addEventListener("pointerdown", onDown);
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerup", onUp);
    root.addEventListener("pointercancel", onUp);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("wheel", onWheel, { passive: false });
    root.addEventListener("click", onClick);
    root.addEventListener("contextmenu", noMenu);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(revealTimer);
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerup", onUp);
      root.removeEventListener("pointercancel", onUp);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("click", onClick);
      root.removeEventListener("contextmenu", noMenu);
      window.removeEventListener("resize", onResize);
      for (const cell of pool) cell.el.remove();
      for (const u of created) URL.revokeObjectURL(u);
    };
  }, [ids]);

  // Esc closes the single-sticker view and the About panel.
  useEffect(() => {
    if (!opened && !aboutOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpened(null);
      setAboutOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opened, aboutOpen]);

  const vars = {
    background: CANVAS.background,
    color: CANVAS.text,
    "--cell": `${CANVAS.cellSize}px`,
    "--fit": `${CANVAS.stickerSize * 100}%`,
    "--hover-scale": CANVAS.hoverScale,
  } as React.CSSProperties;

  return (
    <>
      <div ref={rootRef} className={ids.length === 0 ? "canvas is-ready" : "canvas"} style={vars}>
        {ids.length === 0 && <p className="empty">Nothing here yet.</p>}
      </div>
      <header className="canvas-bar" style={{ color: CANVAS.text }}>
        <span className="canvas-bar-title">
          <LogoMark />
          Sticker Index
        </span>
        <button
          type="button"
          className={aboutOpen ? "is-active" : undefined}
          aria-expanded={aboutOpen}
          onClick={() => setAboutOpen((o) => !o)}
        >
          About
        </button>
      </header>
      {aboutOpen && (
        // Clicking the blurred background closes it; clicks inside the panel don't.
        <div className="about-backdrop" onClick={() => setAboutOpen(false)}>
          <div className="about-panel" role="dialog" aria-label="About" onClick={(e) => e.stopPropagation()}>
            {ABOUT.paragraphs.map((text) => (
              <p key={text}>{text}</p>
            ))}
            <p className="about-credit">{ABOUT.credit}</p>
          </div>
        </div>
      )}
      {opened && (
        <div className="canvas-overlay" style={vars} onClick={() => setOpened(null)}>
          <img
            src={opened.url}
            alt="Sticker"
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          />
          <p className="canvas-caption">{caption(stickers[opened.index])}</p>
        </div>
      )}
    </>
  );
}

/** "12 Oct 2026 · Mong Kok, Hong Kong", or just the date. */
function caption(s: PublicSticker | undefined) {
  if (!s) return null;
  return [formatDay(s.day), s.area].filter(Boolean).join(" · ");
}

/** Modulo that stays positive for negative numbers: mod(-1, 3) = 2. */
function mod(a: number, b: number) {
  return ((a % b) + b) % b;
}
