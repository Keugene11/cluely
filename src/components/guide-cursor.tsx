"use client";

import { useEffect, useRef, useState } from "react";
import { getDesktop } from "@/lib/desktop";

/**
 * Clicky-style guiding cursor: a glowing blue triangle that flies along an
 * upward arc to the target, rotating to face its direction of travel and
 * scaling up at mid-flight, then rests on a pulsing highlight ring. The window
 * is transparent and click-through, so the user can press the button beneath.
 */
export function GuideCursor() {
  const [label, setLabel] = useState("");
  const [visible, setVisible] = useState(false);
  const [ring, setRing] = useState({ x: -200, y: -200 });

  const flyRef = useRef<HTMLDivElement>(null);
  const triRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: -200, y: -200 });
  const rafRef = useRef(0);

  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop) return;

    // Fly the triangle from its current spot to (tx,ty) along an upward arc.
    const flyTo = (tx: number, ty: number) => {
      cancelAnimationFrame(rafRef.current);
      const start = { ...posRef.current };
      // First appearance: swoop in from up and to the left of the target.
      if (start.x < 0) {
        start.x = tx - 220;
        start.y = ty - 160;
      }

      const dist = Math.hypot(tx - start.x, ty - start.y);
      const lift = Math.min(180, dist * 0.4); // how high the arc bows up
      const mx = (start.x + tx) / 2;
      const my = (start.y + ty) / 2 - lift;
      const dur = Math.min(950, Math.max(420, dist * 1.15));
      const t0 = performance.now();
      const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic

      const frame = (now: number) => {
        const raw = Math.min(1, (now - t0) / dur);
        const t = ease(raw);
        const it = 1 - t;

        const x = it * it * start.x + 2 * it * t * mx + t * t * tx;
        const y = it * it * start.y + 2 * it * t * my + t * t * ty;
        const dxdt = 2 * it * (mx - start.x) + 2 * t * (tx - mx);
        const dydt = 2 * it * (my - start.y) + 2 * t * (ty - my);
        const angle = (Math.atan2(dydt, dxdt) * 180) / Math.PI + 90;
        const scale = 1 + Math.sin(t * Math.PI) * 0.45; // biggest mid-flight

        posRef.current = { x, y };
        if (flyRef.current) flyRef.current.style.transform = `translate(${x}px, ${y}px)`;
        if (triRef.current) {
          triRef.current.style.transform = `rotate(${angle}deg) scale(${raw < 1 ? scale : 1})`;
        }
        if (raw < 1) rafRef.current = requestAnimationFrame(frame);
      };
      rafRef.current = requestAnimationFrame(frame);
    };

    return desktop.onPointTo((next) => {
      if (!next) {
        setVisible(false);
        cancelAnimationFrame(rafRef.current);
        return;
      }
      setLabel(next.label);
      setVisible(true);
      setRing({ x: next.x, y: next.y });
      flyTo(next.x, next.y);
    });
  }, []);

  return (
    <div
      className={`pointer-events-none fixed inset-0 transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Pulsing highlight ring at the destination */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: ring.x, top: ring.y, transition: "left 0.5s ease, top 0.5s ease" }}
      >
        <span className="cursor-ring" />
        <span className="cursor-ring cursor-ring-2" />
      </div>

      {/* Flying triangle */}
      <div ref={flyRef} className="absolute left-0 top-0" style={{ willChange: "transform" }}>
        <div ref={triRef} style={{ willChange: "transform" }}>
          <svg width="30" height="34" viewBox="0 0 30 34" className="cursor-tri">
            <path
              d="M15 0 L29 30 L15 22 L1 30 Z"
              fill="url(#triGrad)"
              stroke="rgba(255,255,255,0.9)"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <defs>
              <linearGradient id="triGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7aa2ff" />
                <stop offset="100%" stopColor="#3b5bff" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {label && <div className="cursor-caption">{label}</div>}
      </div>
    </div>
  );
}
