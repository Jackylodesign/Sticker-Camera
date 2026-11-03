"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Makes an open dialog behave for keyboard and screen-reader users. Call it in
 * a component that is only rendered while the dialog is open.
 * - Focus moves in ([data-autofocus], else the first button or link).
 * - Tab and Shift+Tab stay inside. Esc closes.
 * - A click closes, unless it lands on something marked [data-keep-open].
 * - On close, focus goes back to whatever had it before (or to `fallback`).
 */
export function useDialog(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  fallback?: RefObject<HTMLElement | null>,
) {
  const close = useEffectEvent(onClose);
  const fallbackEl = useEffectEvent(() => fallback?.current ?? null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = () => [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
    (dialog.querySelector<HTMLElement>("[data-autofocus]") ?? items()[0] ?? dialog).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const list = items();
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (!first) {
        e.preventDefault();
      } else if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!(e.target as Element).closest("[data-keep-open]")) close();
    };
    document.addEventListener("keydown", onKey);
    dialog.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      dialog.removeEventListener("click", onClick);
      // The dialog is gone, so focus fell to <body>. Put it back, unless the
      // visitor already moved it somewhere else (e.g. clicked About).
      const active = document.activeElement;
      if (active && active !== document.body && !dialog.contains(active)) return;
      const back = opener && opener !== document.body && opener.isConnected ? opener : fallbackEl();
      back?.focus();
    };
  }, [ref]);
}
