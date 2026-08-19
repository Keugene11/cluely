"use client";

import { useEffect, useRef, useState } from "react";
import { getDesktop } from "@/lib/desktop";

/**
 * The guiding cursor: a glowing pointer that glides across the screen to the
 * element being talked about, trailing light, and presses down when Otto
 * actually clicks. The window is transparent and click-through, so nothing here
 * gets in the way of the app underneath.
 *
 * Motion is a critically-ish damped spring rather than a timed tween. That
 * matters for feel: a tween has to be cancelled and restarted when the target
 * moves mid-flight (which is what made this jump), while a spring just re-aims
 * and keeps its momentum. Everything below runs in ONE rAF loop writing
 * transforms directly — no React state per frame.
 */

const STIFFNESS = 120;
const DAMPING = 2 * Math.sqrt(STIFFNESS) * 0.9; // just shy of critical: a soft settle, no bounce
const TRAIL = 16; // points of history in the comet tail
const PRESS_MS = 260; // how long the cursor stays squashed on a click
const TIP = { x: 5, y: 3 }; // where the arrow's point sits inside its svg box

type Target = { x: number; y: number; label: string };

export function GuideCursor() {
  const [label, setLabel] = useState("");
  const [visible, setVisible] = useState(false);
  const [settled, setSettled] = useState(false);
  const [ripples, setRipples] = useState<number[]>([]);

  const wrapRef = useRef<HTMLDivElement>(null); // translated to the cursor position
  const armRef = useRef<HTMLDivElement>(null); // leans + scales around the tip
  const ringRef = useRef<HTMLDivElement>(null); // halo parked on the target
  const trailRef = useRef<SVGPolylineElement>(null);

  const target = useRef<Target | null>(null);
  const pos = useRef({ x: -300, y: -300 });
  const vel = useRef({ x: 0, y: 0 });
  const history = useRef<{ x: number; y: number }[]>([]);
  const pressAt = useRef(0);
  const rippleId = useRef(0);
  const settledRef = useRef(false);

  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop) return;

    let raf = 0;
    let last = 0;

    const frame = (now: number) => {
      // Clamped so a dropped frame or a backgrounded window can't fling the
      // spring across the screen when it resumes.
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;

      const t = target.current;
      if (!t) {
        raf = 0; // nothing to animate; wake() restarts the loop
        return;
      }

      const dx = t.x - pos.current.x;
      const dy = t.y - pos.current.y;
      vel.current.x += (STIFFNESS * dx - DAMPING * vel.current.x) * dt;
      vel.current.y += (STIFFNESS * dy - DAMPING * vel.current.y) * dt;
      pos.current.x += vel.current.x * dt;
      pos.current.y += vel.current.y * dt;

      const speed = Math.hypot(vel.current.x, vel.current.y);
      const arrived = Math.hypot(dx, dy) < 1.5 && speed < 30;
      if (arrived !== settledRef.current) {
        settledRef.current = arrived;
        setSettled(arrived);
      }

      // A pointer that spins to face its heading reads as a paper plane, not a
      // cursor. Lean a few degrees into the movement instead, and swell very
      // slightly with speed — enough to feel alive, not cartoonish.
      const lean = Math.max(-12, Math.min(12, vel.current.x * 0.012));
      const swell = Math.min(0.14, speed / 9000);

      // The click press: squash toward the tip, then release.
      const since = now - pressAt.current;
      const pressing = since < PRESS_MS;
      const press = pressing ? Math.sin((since / PRESS_MS) * Math.PI) : 0;

      if (wrapRef.current) {
        wrapRef.current.style.transform = `translate3d(${pos.current.x - TIP.x}px, ${pos.current.y - TIP.y}px, 0)`;
      }
      if (armRef.current) {
        armRef.current.style.transform = `rotate(${lean}deg) scale(${1 + swell - press * 0.28})`;
      }
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${t.x}px, ${t.y}px, 0)`;
      }

      // Comet tail: a polyline through recent positions, brightest when fast
      // and gone entirely once parked, so a resting cursor stays clean.
      history.current.push({ x: pos.current.x, y: pos.current.y });
      if (history.current.length > TRAIL) history.current.shift();
      if (trailRef.current) {
        trailRef.current.setAttribute(
          "points",
          history.current.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
        );
        trailRef.current.style.opacity = String(Math.min(0.7, speed / 1600));
      }

      // Stop once everything has come to rest. This window is always on top and
      // lives for the whole session, so a loop that never parks is 60fps of
      // no-op compositing forever — for a cursor that is usually not moving.
      // Nothing here animates from CSS except the halo, so there is nothing to
      // keep ticking for.
      if (arrived && !pressing) {
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    /** Start the loop if it is parked. Cheap to call on every event. */
    const wake = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const offPoint = desktop.onPointTo((next) => {
      if (!next) {
        setVisible(false);
        target.current = null;
        history.current = [];
        return;
      }

      // First appearance (or after a hide): come in from off to the upper left
      // rather than materializing on top of the button.
      if (!target.current) {
        pos.current = { x: next.x - 260, y: next.y - 190 };
        vel.current = { x: 0, y: 0 };
        history.current = [];
      }
      target.current = next;
      settledRef.current = false;
      setSettled(false);
      setLabel(next.label);
      setVisible(true);
      wake();
    });

    const offPress = desktop.onPress?.(() => {
      pressAt.current = performance.now();
      // Date.now() collides for two clicks inside the same millisecond, which
      // React renders as a duplicate key. A counter cannot.
      const id = ++rippleId.current;
      setRipples((r) => [...r, id]);
      setTimeout(() => setRipples((r) => r.filter((k) => k !== id)), 700);
      wake();
    });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      offPoint();
      offPress?.();
    };
  }, []);

  return (
    <div
      className={`pointer-events-none fixed inset-0 overflow-hidden transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Motion trail, drawn under everything else */}
      <svg className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="trailGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6f8cff" stopOpacity="0" />
            <stop offset="100%" stopColor="#a9beff" stopOpacity="0.95" />
          </linearGradient>
        </defs>
        <polyline
          ref={trailRef}
          fill="none"
          stroke="url(#trailGrad)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="cursor-trail"
        />
      </svg>

      {/* Halo parked on the destination — only once the cursor has landed */}
      <div ref={ringRef} className="absolute left-0 top-0" style={{ willChange: "transform" }}>
        <div className={`cursor-halo ${settled ? "is-on" : ""}`}>
          <span className="cursor-ring" />
          <span className="cursor-ring cursor-ring-2" />
          <span className="cursor-dot" />
        </div>
        {ripples.map((id) => (
          <span key={id} className="cursor-ripple" />
        ))}
      </div>

      {/* The pointer */}
      <div ref={wrapRef} className="absolute left-0 top-0" style={{ willChange: "transform" }}>
        <div ref={armRef} className="cursor-arm">
          <svg width="26" height="30" viewBox="0 0 26 30" className="cursor-arrow">
            <path
              d="M5 3 L5 25.2 L10.4 20.1 L13.6 27.4 L17.1 25.8 L14 18.7 L20.8 18.4 Z"
              fill="url(#arrowGrad)"
              stroke="rgba(255,255,255,0.92)"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            <defs>
              <linearGradient id="arrowGrad" x1="0" y1="0" x2="0.6" y2="1">
                <stop offset="0%" stopColor="#8fb0ff" />
                <stop offset="100%" stopColor="#3556f5" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {label && (
          <div className={`cursor-caption ${settled ? "is-on" : ""}`}>{label}</div>
        )}
      </div>
    </div>
  );
}
