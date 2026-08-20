/**
 * Small pure helpers shared by the API routes — extracted so they can be unit
 * tested without a running server or a browser.
 */

export type ImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

const IMAGE_RE = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/;

/** Split a `data:image/...;base64,...` URL into its media type and payload. */
export function parseImageDataUrl(
  value: unknown,
): { mediaType: ImageMediaType; data: string } | null {
  if (typeof value !== "string") return null;
  const match = value.match(IMAGE_RE);
  if (!match) return null;
  return { mediaType: match[1] as ImageMediaType, data: match[2] };
}

/**
 * Parse JSON a model returned, tolerating a ```json fence or leading/trailing
 * prose by falling back to the outermost {...} block. Returns null on failure.
 */
export function parseModelJson<T = unknown>(text: string): T | null {
  const stripped = text.replace(/^```(?:json)?/gim, "").replace(/```$/gim, "").trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    // Fall back to the first balanced-looking object in the text.
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(stripped.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Whether a launch target is safe to hand to the executor.
 *
 * The executor passes this to Start-Process inside single quotes (with quotes
 * escaped), so it cannot break out into a shell command on its own. This is the
 * belt to that suspenders: reject empty, absurdly long, or whitespace/control
 * character targets, which is all that is left to go wrong.
 */
export function isSafeLaunchTarget(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return value.length > 0 && value.length < 400 && !/[\r\n\t ]/.test(value);
}

export type Point = { x: number; y: number; label: string };

/**
 * Force a guide point's coordinates into the [0,1] range so a stray or missing
 * value can never send the cursor off screen. Returns null for a null input.
 */
export function clampPoint(point: unknown): Point | null {
  if (!point || typeof point !== "object") return null;
  const p = point as Partial<Point>;
  return {
    x: coord(p.x),
    y: coord(p.y),
    label: typeof p.label === "string" ? p.label : "",
  };
}

export const ACTION_KINDS = [
  "click",
  "double_click",
  "type",
  "key",
  "scroll",
  "drag",
  "focus",
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

/** One thing to do on screen. Only the fields its `kind` needs are present. */
export type Action = {
  kind: ActionKind;
  label: string;
  x?: number;
  y?: number;
  to?: { x: number; y: number };
  text?: string;
  combo?: string;
  notches?: number;
  /** For kind "focus": the app to bring to the front, by name. */
  app?: string;
};

const unit = (value: unknown) => Math.min(1, Math.max(0, Number(value)));
const hasPoint = (v: Record<string, unknown>) =>
  Number.isFinite(Number(v.x)) && Number.isFinite(Number(v.y));

/**
 * Actions drive a real mouse and keyboard on someone's desktop, so nothing from
 * the model reaches the executor unchecked: unknown kinds are dropped, and an
 * action missing what its kind needs is discarded rather than run with a zero
 * filled in. Note this deliberately does NOT use clampPoint, whose missing-value
 * fallback is 0.5 — a centre-screen click is a click on something real, and for
 * an action that fires unattended, dropping it beats guessing.
 *
 * Capped at 5: the model is told to stop where it would need to look again, and
 * a long blind sequence is where an unattended run goes wrong without noticing.
 */
/** Kinds that act on a coordinate, and so depend on the screenshot still being true. */
const POSITIONAL: ReadonlySet<string> = new Set(["click", "double_click", "scroll", "drag"]);

export function normalizeActions(value: unknown): Action[] {
  if (!Array.isArray(value)) return [];
  const out: Action[] = [];
  let usedPosition = false;
  for (const raw of value.slice(0, 5)) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    const kind = String(a.kind) as ActionKind;
    if (!ACTION_KINDS.includes(kind)) continue;
    const label = typeof a.label === "string" ? a.label : "";

    if (kind === "type") {
      const text = typeof a.text === "string" ? a.text : "";
      if (!text) continue;
      out.push({ kind, label, text: text.slice(0, 2000) });
      continue;
    }
    // Bringing a window forward is not a click on anything, so it needs no
    // coordinate — but it repaints the whole screen, which makes every
    // coordinate read from the current screenshot wrong afterwards. It therefore
    // spends the one positional slot, and nothing aimed may follow it this turn.
    if (kind === "focus") {
      const app = String(a.app ?? a.label ?? "").trim();
      if (!app || app.length > 100 || /[\r\n\t]/.test(app)) continue;
      if (usedPosition) break;
      usedPosition = true;
      out.push({ kind, label, app });
      continue;
    }
    if (kind === "key") {
      const combo = String(a.combo ?? "").trim().toLowerCase();
      // The same shape the executor enforces, checked here too so a bad combo
      // is a dropped action rather than an error partway through a run.
      if (!/^[a-z0-9+\s]{1,40}$/.test(combo)) continue;
      out.push({ kind, label, combo });
      continue;
    }
    // Everything below acts on a coordinate read off a screenshot that is
    // already a moment old. One is fine — the screen has not moved yet. A
    // second is a coordinate chosen before the first action changed the page,
    // which is how a run ends up clicking whatever slid into that spot. Cut the
    // batch here and let the next turn look again.
    if (usedPosition) break;
    if (!hasPoint(a)) continue;
    usedPosition = POSITIONAL.has(kind);
    const x = unit(a.x);
    const y = unit(a.y);
    if (kind === "drag") {
      const to = (a.to ?? {}) as Record<string, unknown>;
      if (!hasPoint(to)) continue;
      out.push({ kind, label, x, y, to: { x: unit(to.x), y: unit(to.y) } });
      continue;
    }
    if (kind === "scroll") {
      const n = Number(a.notches);
      out.push({ kind, label, x, y, notches: Number.isFinite(n) ? Math.trunc(n) : -3 });
      continue;
    }
    out.push({ kind, label, x, y });
  }
  return out;
}

/**
 * A single coordinate, clamped to [0,1]. Anything that isn't a real number —
 * null, undefined, "", a boolean, NaN — falls back to 0.5 (center) rather than
 * to 0, so a missing value never parks the cursor in the top-left corner.
 */
function coord(value: unknown): number {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") {
    return 0.5;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}
