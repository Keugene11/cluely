/**
 * The thread's data model, kept out of the session hook so it can be reasoned
 * about — and tested — without React.
 */

export type Line = { speaker: "me" | "them"; text: string; at_ms: number };

export type Point = { x: number; y: number; label: string };

/**
 * One thing to do on screen. Mirrors `Action` in lib/parse rather than importing
 * it, so this model stays free of anything that touches a request.
 */
export type Action = {
  kind: "click" | "double_click" | "type" | "key" | "scroll" | "drag";
  label: string;
  x?: number;
  y?: number;
  to?: { x: number; y: number };
  text?: string;
  combo?: string;
  notches?: number;
};
export type GuideResult = {
  say: string;
  steps: string[];
  point: Point | null;
  /** Ordered things to do for this step. Empty when a single click is enough. */
  actions?: Action[];
  /** What should be visibly true on screen once this step has worked. */
  expect?: string;
  /** Whether the PREVIOUS step's expectation came true. Null when unchecked. */
  happened?: boolean | null;
  done: boolean;
};

/**
 * One turn of the conversation. There is no mode switch any more: the user
 * asks, /api/ask decides, and the kind of entry that comes back is the answer
 * to "what did they want". All three render in the same thread.
 */
export type Entry =
  | { kind: "text"; question: string; answer: string; done: boolean }
  | {
      kind: "guide";
      question: string;
      result: GuideResult;
      step: number;
      working: boolean;
      /** A real click is in flight on this step. */
      clicking: boolean;
      /** Otto is clicking its way through the remaining steps on its own. */
      auto: boolean;
      error: string | null;
      done: boolean;
    }
  | {
      kind: "act";
      question: string;
      say: string;
      target: string | null;
      label: string;
      /** "confirm" waits for a click; everything else is terminal or in flight. */
      status: "confirm" | "running" | "done" | "error" | "blocked";
      detail: string | null;
      done: boolean;
    };

/**
 * Append buffered streamed text to the rows it belongs to, in one pass.
 *
 * Streaming applies deltas per animation frame rather than per token, because
 * react-markdown re-parses the whole answer on every change — so a per-token
 * update is quadratic in answer length. This is the merge step: `pending` maps
 * an entry index to everything that arrived since the last flush.
 *
 * Rows that changed kind since the delta was buffered (a tool call can rewrite
 * the row a text answer was heading for) are left alone rather than corrupted,
 * and untouched rows keep their identity so a memoized card does not re-render.
 */
export function applyTextDeltas(entries: Entry[], pending: Map<number, string>): Entry[] {
  if (pending.size === 0) return entries;
  return entries.map((entry, i) => {
    const delta = pending.get(i);
    if (!delta || entry.kind !== "text") return entry;
    return { ...entry, answer: entry.answer + delta };
  });
}
