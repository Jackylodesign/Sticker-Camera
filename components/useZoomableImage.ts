"use client";

import { useEffect, type RefObject } from "react";
import { CANVAS } from "@/lib/config/canvas";

const TAP_SLOP = 6; // px a pointer may move and still count as a tap
const DOUBLE_TAP = 300; // ms between the two taps of a double tap
const WHEEL_ZOOM = 0.01; // how fast a trackpad pinch zooms
const KEY_ZOOM = 1.25; // how much one press of + or - zooms
const KEY_MOVE = 60; // px one arrow key moves a zoomed image

/**
 * Lets visitors zoom into an image inside a dialog, instead of the browser
 * zooming the whole page.
 * - Pinch anywhere in the dialog, or double tap the image to zoom in and back.
 * - While zoomed, drag the image to look around.
 * - Trackpad pinch, Ctrl + scroll and the + - 0 and arrow keys work too.
 * A drag that ends outside the image doesn't count as a click, so it doesn't
 * close the dialog (see useDialog).
 */
export function useZoomableImage(dialogRef: RefObject<HTMLElement | null>, imageRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const dialog = dialogRef.current;
    const image = imageRef.current;
    if (!dialog || !image) return;

    let zoom = 1;
    let x = 0; // how far the image has moved from its resting place, px
    let y = 0;

    const centre = () => ({
      x: image.offsetLeft + image.offsetWidth / 2,
      y: image.offsetTop + image.offsetHeight / 2,
    });
    // Stops at the point where the image's edge reaches the screen's edge, so
    // it can't be lost. Too small to fill the screen: it stays in the middle.
    const limit = (size: number, screen: number, middle: number) =>
      Math.max(0, (size * zoom - screen) / 2 + Math.abs(middle - screen / 2));
    const apply = () => {
      const c = centre();
      const limitX = zoom === 1 ? 0 : limit(image.offsetWidth, dialog.clientWidth, c.x);
      const limitY = zoom === 1 ? 0 : limit(image.offsetHeight, dialog.clientHeight, c.y);
      x = Math.min(limitX, Math.max(-limitX, x));
      y = Math.min(limitY, Math.max(-limitY, y));
      image.style.transform = zoom === 1 ? "" : `translate(${x}px, ${y}px) scale(${zoom})`;
      image.style.cursor = zoom === 1 ? "" : "grab";
    };
    // Zooms around a point on screen, which stays under the fingers or mouse.
    const zoomTo = (next: number, px: number, py: number) => {
      const target = Math.min(CANVAS.stickerMaxZoom, Math.max(1, next));
      const c = centre();
      const ratio = target / zoom;
      x = px - c.x - (px - c.x - x) * ratio;
      y = py - c.y - (py - c.y - y) * ratio;
      zoom = target;
      apply();
    };

    // ---------- fingers and mouse ----------
    const touches = new Map<number, { x: number; y: number }>();
    let pinch: { distance: number; x: number; y: number } | null = null;
    let dragId = -1;
    let lastX = 0;
    let lastY = 0;
    let startX = 0;
    let startY = 0;
    let moved = false;
    let lastTap = { time: 0, x: 0, y: 0 };

    const measurePinch = () => {
      const [a, b] = [...touches.values()];
      return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };

    const onDown = (e: PointerEvent) => {
      if (touches.size === 0 && dragId === -1) moved = false;
      if ((e.target as Element).closest("button")) return;
      if (e.pointerType === "touch") {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2) {
          pinch = measurePinch();
          dragId = -1;
          moved = true;
          return;
        }
      }
      if (dragId !== -1 || pinch || e.target !== image || (e.pointerType === "mouse" && e.button !== 0)) return;
      dragId = e.pointerId;
      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
      if (e.pointerType === "mouse") image.setPointerCapture(e.pointerId); // keep following outside the image
    };

    const onMove = (e: PointerEvent) => {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && touches.size === 2) {
        const now = measurePinch();
        x += now.x - pinch.x;
        y += now.y - pinch.y;
        zoomTo(pinch.distance > 0 ? (zoom * now.distance) / pinch.distance : zoom, now.x, now.y);
        pinch = now;
        return;
      }
      if (e.pointerId !== dragId) return;
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > TAP_SLOP) moved = true;
      if (zoom > 1 && moved) {
        x += e.clientX - lastX;
        y += e.clientY - lastY;
        apply();
      }
      lastX = e.clientX;
      lastY = e.clientY;
    };

    const onUp = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      if (pinch) {
        if (touches.size >= 2) return;
        pinch = null;
        // One finger still down: carry on dragging with it, no jump.
        const [rest] = [...touches];
        if (rest) {
          dragId = rest[0];
          lastX = rest[1].x;
          lastY = rest[1].y;
        }
        return;
      }
      if (e.pointerId !== dragId) return;
      dragId = -1;
      if (moved || e.type !== "pointerup") return;
      const isDouble =
        e.timeStamp - lastTap.time < DOUBLE_TAP && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30;
      if (isDouble) {
        zoomTo(zoom > 1 ? 1 : CANVAS.stickerTapZoom, e.clientX, e.clientY);
        lastTap = { time: 0, x: 0, y: 0 };
      } else {
        lastTap = { time: e.timeStamp, x: e.clientX, y: e.clientY };
      }
    };

    // Runs before useDialog's click handler: the end of a drag isn't a click.
    const onClick = (e: MouseEvent) => {
      if (moved) e.stopImmediatePropagation();
    };

    // ---------- trackpad, mouse wheel and keys ----------
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // no page zoom
      if (e.ctrlKey) {
        zoomTo(zoom * Math.exp(-e.deltaY * WHEEL_ZOOM), e.clientX, e.clientY);
      } else if (zoom > 1) {
        x -= e.deltaX;
        y -= e.deltaY;
        apply();
      }
    };

    // Safari sends a trackpad pinch as its own "gesture" events instead, and
    // would zoom the whole page on an iPhone. Fingers are handled above.
    let gestureScale = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureScale = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      if (touches.size > 0) return;
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      zoomTo((zoom * g.scale) / gestureScale, g.clientX, g.clientY);
      gestureScale = g.scale;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      const c = centre();
      if (e.key === "+" || e.key === "=") zoomTo(zoom * KEY_ZOOM, c.x, c.y);
      else if (e.key === "-") zoomTo(zoom / KEY_ZOOM, c.x, c.y);
      else if (e.key === "0") zoomTo(1, c.x, c.y);
      else if (e.key === "ArrowLeft") x += KEY_MOVE;
      else if (e.key === "ArrowRight") x -= KEY_MOVE;
      else if (e.key === "ArrowUp") y += KEY_MOVE;
      else if (e.key === "ArrowDown") y -= KEY_MOVE;
      else return;
      e.preventDefault();
      apply();
    };

    dialog.addEventListener("pointerdown", onDown);
    dialog.addEventListener("pointermove", onMove);
    dialog.addEventListener("pointerup", onUp);
    dialog.addEventListener("pointercancel", onUp);
    dialog.addEventListener("click", onClick, true);
    dialog.addEventListener("wheel", onWheel, { passive: false });
    dialog.addEventListener("gesturestart", onGestureStart);
    dialog.addEventListener("gesturechange", onGestureChange);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", apply);
    return () => {
      dialog.removeEventListener("pointerdown", onDown);
      dialog.removeEventListener("pointermove", onMove);
      dialog.removeEventListener("pointerup", onUp);
      dialog.removeEventListener("pointercancel", onUp);
      dialog.removeEventListener("click", onClick, true);
      dialog.removeEventListener("wheel", onWheel);
      dialog.removeEventListener("gesturestart", onGestureStart);
      dialog.removeEventListener("gesturechange", onGestureChange);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", apply);
    };
  }, [dialogRef, imageRef]);
}
