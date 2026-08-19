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
