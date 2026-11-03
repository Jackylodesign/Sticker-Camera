"use client";

// An endless grid of stickers you can drag in any direction.
// - The set of stickers repeats forever in both directions (modulo maths).
// - Only the cells around the screen exist in the page. When a cell scrolls
//   off one edge, the same element is reused for the cell coming in on the
//   other edge.
// - One requestAnimationFrame loop moves everything with translate3d. It only
//   runs while something is moving.
// - On desktop the grid drifts slightly with the mouse, hinting it can be dragged.
// - Keyboard: arrow keys move one cell (Shift: three), Enter opens the middle one.
// - Screen readers get a plain list of the same stickers instead (the grid
//   repeats forever, so its images have alt="" and the list names each once).
// - "Reduce motion" turns off the glide, the drift and the eased key moves.
// - The grid stays hidden until the stickers on screen have loaded, then fades
//   in all at once (no empty frames while loading).
// Sizes, colours and friction: CANVAS in lib/constants.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import LogoMark from "@/components/LogoMark";
import { useDialog } from "@/components/useDialog";
import { ABOUT, CANVAS } from "@/lib/constants";
import type { PublicSticker } from "@/lib/db";
import { formatDay, stickerName } from "@/lib/meta";
import styles from "./InfiniteCanvas.module.css";

type Cell = { el: HTMLDivElement; img: HTMLImageElement; index: number };

const FRAME = 1000 / 60; // ms
const TAP_SLOP = 6; // px a pointer may move and still count as a tap
const REVEAL_TIMEOUT = 5000; // ms: show the grid anyway if images are this slow
const KEY_EASE = 0.2; // share of the remaining key move done each frame
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export default function InfiniteCanvas({ stickers }: { stickers: PublicSticker[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listTitleRef = useRef<HTMLHeadingElement>(null);
  // Set by the grid below; the sticker list uses it to open a sticker.
  const openRef = useRef<(index: number) => void>(() => {});
  const ids = useMemo(() => stickers.map((s) => s.id), [stickers]);
  const [opened, setOpened] = useState<{ url: string; index: number } | null>(null);
  // About opens on arrival, so visitors read the intro first. They close it
  // (Explore button, click outside or Esc) to see the stickers.
  const [aboutOpen, setAboutOpen] = useState(true);

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
    // Set on unmount: a download that finishes later makes no URL (it would leak).
    let cancelled = false;
    const urlFor = (i: number) => {
      let url = urls.get(i);
      if (!url) {
        url = fetch(`/api/gallery/${ids[i]}/image`)
          .then((res) => (res.ok ? res.blob() : Promise.reject()))
          .then((blob) => {
            if (cancelled) return "";
            const u = URL.createObjectURL(blob);
            created.push(u);
            return u;
          })
          .catch(() => "");
        urls.set(i, url);
      }
      return url;
    };
    const open = (i: number) => urlFor(i).then((u) => u && setOpened({ url: u, index: i }));
    openRef.current = open;

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
    let kx = 0; // keyboard move still to go, px
    let ky = 0;

    const buildPool = () => {
      for (const cell of pool) cell.el.remove();
      // One spare column/row on each side, so swaps happen off screen.
      poolCols = Math.ceil(root.clientWidth / pitch) + 2;
      poolRows = Math.ceil(root.clientHeight / pitch) + 2;
      pool = Array.from({ length: poolCols * poolRows }, () => {
        const el = document.createElement("div");
        el.className = styles.cell;
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
      // Ease towards where the arrow keys asked to go.
      if (kx || ky) {
        const k = 1 - Math.pow(1 - KEY_EASE, dt / FRAME);
        const done = Math.hypot(kx, ky) < 0.5;
        const mx = done ? kx : kx * k;
        const my = done ? ky : ky * k;
        ox += mx;
        oy += my;
        kx -= mx;
        ky -= my;
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
      if (dragging || vx || vy || kx || ky || drifting) {
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
    let stoppedFling = false; // this tap only stopped a glide
    let samples: { x: number; y: number; t: number }[] = [];

    const onDown = (e: PointerEvent) => {
      if (pointerId !== -1 || (e.pointerType === "mouse" && e.button !== 0)) return; // one finger at a time
      pointerId = e.pointerId;
      root.setPointerCapture(pointerId);
      dragging = true;
      moved = false;
      stoppedFling = Math.hypot(vx, vy) > 0.05; // still gliding: this tap just stops it
      vx = vy = kx = ky = 0;
      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
      samples = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
      wake();
    };
    // Mouse hovering (not dragging): drift away from the pointer, as if
    // leaning towards what's on that side.
    const onHover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || dragging || !CANVAS.drift || reducedMotion()) return;
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
        root.classList.add(styles.isDragging);
      }
      samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      samples = samples.filter((s) => e.timeStamp - s.t < 100);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      pointerId = -1;
      dragging = false;
      root.classList.remove(styles.isDragging);
      // Fling speed = movement over the last ~100ms, unless the finger
      // stopped before letting go.
      const recent = samples.filter((s) => e.timeStamp - s.t < 100);
      const first = recent[0];
      const last = recent[recent.length - 1];
      const fling = e.type === "pointerup" && !reducedMotion();
      if (fling && first && last && last.t > first.t && e.timeStamp - last.t < 50) {
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
      vx = vy = kx = ky = 0;
      wake();
    };

    // ---------- tap / click: open one sticker ----------
    const onClick = (e: MouseEvent) => {
      if (moved || stoppedFling) return;
      const px = e.clientX - ox - dx - CANVAS.gap / 2;
      const py = e.clientY - oy - dy - CANVAS.gap / 2;
      const c = Math.floor(px / pitch);
      const r = Math.floor(py / pitch);
      // Ignore taps in the gap between cells.
      if (px - c * pitch > CANVAS.cellSize || py - r * pitch > CANVAS.cellSize) return;
      open(indexAt(c, r));
    };

    // ---------- keyboard ----------
    // Where ox/oy rest with sticker 0 in the middle; key moves land on this grid.
    const homeX = () => (root.clientWidth - pitch) / 2;
    const homeY = () => (root.clientHeight - pitch) / 2;
    const snap = (v: number, home: number) => home + Math.round((v - home) / pitch) * pitch;
    const onKey = (e: KeyboardEvent) => {
      const dir = ARROWS[e.key];
      if (dir) {
        e.preventDefault();
        const step = pitch * (e.shiftKey ? 3 : 1);
        const tx = snap(ox + kx - dir[0] * step, homeX());
        const ty = snap(oy + ky - dir[1] * step, homeY());
        vx = vy = 0;
        if (reducedMotion()) {
          ox = tx;
          oy = ty;
          kx = ky = 0;
          render();
        } else {
          kx = tx - ox;
          ky = ty - oy;
          wake();
        }
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        // The cell nearest the middle of the screen (where a key move ends).
        const px = root.clientWidth / 2 - (ox + kx + dx) - pitch / 2;
        const py = root.clientHeight / 2 - (oy + ky + dy) - pitch / 2;
        open(indexAt(Math.round(px / pitch), Math.round(py / pitch)));
      }
    };

    const onResize = () => {
      buildPool();
      render();
    };
    const noMenu = (e: Event) => e.preventDefault();

    // Start with sticker 0 in the middle of the screen.
    ox = homeX();
    oy = homeY();
    buildPool();
    render();

    // Reveal once the stickers on screen are downloaded and decoded, or after
    // REVEAL_TIMEOUT so a slow image never keeps the page blank.
    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      root.classList.add(styles.isReady);
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
    root.addEventListener("keydown", onKey);
    root.addEventListener("contextmenu", noMenu);
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(revealTimer);
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerup", onUp);
      root.removeEventListener("pointercancel", onUp);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKey);
      root.removeEventListener("contextmenu", noMenu);
      window.removeEventListener("resize", onResize);
      for (const cell of pool) cell.el.remove();
      for (const u of created) URL.revokeObjectURL(u);
    };
  }, [ids]);

  const vars = {
    background: CANVAS.background,
    color: CANVAS.text,
    "--cell": `${CANVAS.cellSize}px`,
    "--fit": `${CANVAS.stickerSize * 100}%`,
    "--hover-scale": CANVAS.hoverScale,
  } as React.CSSProperties;

  const hasStickers = ids.length > 0;

  return (
    <>
      <header className={styles.bar} style={{ color: CANVAS.text }}>
        {hasStickers && (
          <a
            href="#sticker-list"
            className={styles.skipLink}
            onClick={(e) => {
              e.preventDefault();
              listTitleRef.current?.focus();
            }}
          >
            Skip to sticker list
          </a>
        )}
        <span className={styles.title}>
          <LogoMark />
          Sticker Index
        </span>
        <button
          type="button"
          className={aboutOpen ? styles.isActive : undefined}
          aria-haspopup="dialog"
          aria-expanded={aboutOpen}
          onClick={() => setAboutOpen((o) => !o)}
        >
          About
        </button>
      </header>
      {hasStickers ? (
        <div
          ref={rootRef}
          className={styles.canvas}
          style={vars}
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a custom widget: it takes arrow keys and Enter (see onKey)
          tabIndex={0}
          role="application"
          aria-label="Sticker canvas. Use arrow keys to move, Enter to open the sticker in the middle"
        />
      ) : (
        <div className={`${styles.canvas} ${styles.isReady}`} style={vars}>
          <p className={`empty ${styles.empty}`}>Nothing here yet.</p>
        </div>
      )}
      {hasStickers && (
        // The same stickers as a plain list, for screen readers and keyboard
        // users. Hidden until something in it has focus (see the CSS module).
        <section className={styles.stickerList} aria-labelledby="sticker-list">
          <h2 id="sticker-list" ref={listTitleRef} tabIndex={-1}>
            Stickers
          </h2>
          <ul>
            {stickers.map((s, i) => (
              <li key={s.id}>
                <button type="button" onClick={() => openRef.current(i)}>
                  {stickerName(s)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} fallback={rootRef} />}
      {opened && (
        <StickerDialog
          url={opened.url}
          sticker={stickers[opened.index]}
          style={vars}
          onClose={() => setOpened(null)}
          fallback={rootRef}
        />
      )}
    </>
  );
}

type DialogProps = { onClose: () => void; fallback: React.RefObject<HTMLElement | null> };

// Clicking the blurred background closes it; clicks inside the panel don't.
function AboutDialog({ onClose, fallback }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, onClose, fallback);
  return (
    <div ref={ref} className={styles.aboutBackdrop}>
      <div className={styles.aboutPanel} role="dialog" aria-modal="true" aria-label="About" data-keep-open>
        {ABOUT.paragraphs.map((text) => (
          <p key={text}>{withLinks(text)}</p>
        ))}
        <button type="button" className={styles.aboutEnter} onClick={onClose} data-autofocus>
          {ABOUT.enter}
        </button>
        <p className={styles.aboutCredit}>{ABOUT.credit}</p>
      </div>
    </div>
  );
}

// One sticker, big. A click anywhere but the sticker closes it.
function StickerDialog({
  url,
  sticker,
  style,
  onClose,
  fallback,
}: DialogProps & { url: string; sticker: PublicSticker | undefined; style: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, onClose, fallback);
  const name = sticker ? stickerName(sticker) : "Sticker";
  return (
    <div ref={ref} className={styles.overlay} style={style} role="dialog" aria-modal="true" aria-label={name}>
      <button type="button" className={styles.close} onClick={onClose}>
        Close
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- in-memory blob URL; next/image can't load it */}
      <img src={url} alt={name} draggable={false} data-keep-open onContextMenu={(e) => e.preventDefault()} />
      <p className={styles.caption}>{caption(sticker)}</p>
    </div>
  );
}

/** "12 Oct 2026 · Mong Kok, Hong Kong", or just the date. */
function caption(s: PublicSticker | undefined) {
  if (!s) return null;
  return [formatDay(s.day), s.area].filter(Boolean).join(" · ");
}

/** Turns "[label](https://…)" inside About text into links (new tab). */
function withLinks(text: string) {
  return text.split(/(\[[^\]]+\]\(https?:\/\/[^)\s]+\))/).map((part, i) => {
    const m = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part);
    if (!m) return part;
    return (
      <a key={i} href={m[2]} target="_blank" rel="noopener noreferrer" style={{ color: ABOUT.linkColor }}>
        {m[1]}
      </a>
    );
  });
}

/** Modulo that stays positive for negative numbers: mod(-1, 3) = 2. */
function mod(a: number, b: number) {
  return ((a % b) + b) % b;
}
