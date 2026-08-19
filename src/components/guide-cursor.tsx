"use client";

import { useEffect, useState } from "react";
import { getDesktop } from "@/lib/desktop";

type Target = { x: number; y: number; label: string } | null;

/**
 * Fills the whole screen (transparent, click-through) and animates a pointer +
 * pulsing ring to wherever the guide says to look. The window itself passes
 * clicks through, so the user can press the button being pointed at.
 */
export function GuideCursor() {
  const [target, setTarget] = useState<Target>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop) return;
    return desktop.onPointTo((next) => {
      setTarget(next);
      setShown(Boolean(next));
    });
  }, []);

  if (!target) return null;

  return (
    <div
      className={`pointer-events-none fixed inset-0 transition-opacity duration-300 ${
        shown ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Pulsing highlight ring at the target */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: target.x, top: target.y, transition: "left 600ms cubic-bezier(0.22,1,0.36,1), top 600ms cubic-bezier(0.22,1,0.36,1)" }}
      >
        <span className="guide-ring absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full" />
        <span className="guide-ring-2 absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full" />
      </div>

      {/* The pointer + caption, offset down-right from the target */}
      <div
        className="absolute"
        style={{
          left: target.x,
          top: target.y,
          transition: "left 600ms cubic-bezier(0.22,1,0.36,1), top 600ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        <svg
          width="34"
          height="34"
          viewBox="0 0 24 24"
          className="guide-pointer absolute drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]"
          style={{ left: 2, top: 2 }}
        >
          <path
            d="M4 2 L4 20 L9 15 L12.5 22 L15.5 20.5 L12 14 L19 14 Z"
            fill="#ffffff"
            stroke="#111"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>

        {target.label && (
          <div className="guide-caption absolute left-8 top-6 whitespace-nowrap rounded-lg bg-black/85 px-2.5 py-1 text-[12px] font-medium text-white shadow-xl backdrop-blur">
            {target.label}
          </div>
        )}
      </div>
    </div>
  );
}
