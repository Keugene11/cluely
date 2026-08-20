"use client";

import { useEffect, useRef } from "react";
import { getDesktop } from "@/lib/desktop";

/**
 * Report this element's height to the desktop shell so the always-on-top window
 * can size itself to fit.
 *
 * This lives in a hook because forgetting it is invisible in the browser and
 * fatal in the app: the window simply stays at bar height and everything below
 * the first 76px is clipped away. That is exactly what happened to the signed-out
 * panel — the sign-in form rendered correctly and no one could see it, so the
 * desktop app could not be logged into at all.
 */
export function useReportHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    const bridge = getDesktop();
    if (!el || !bridge?.resize) return;

    let raf = 0;
    let sent = -1;
    const report = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // Each call is an IPC hop plus a setBounds on a transparent,
        // always-on-top window — expensive enough that firing it for a height
        // we already asked for is worth avoiding. A streaming answer trips the
        // observer constantly while the height sits still.
        const height = el.offsetHeight;
        if (height === sent) return;
        sent = height;
        bridge.resize(height);
      });
    };

    const ro = new ResizeObserver(report);
    ro.observe(el);
    report();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return ref;
}
