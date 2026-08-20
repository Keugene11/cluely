import { describe, expect, it } from "vitest";
import {
  clampPoint,
  isSafeLaunchTarget,
  normalizeActions,
  parseImageDataUrl,
  parseModelJson,
} from "@/lib/parse";

describe("parseImageDataUrl", () => {
  it("splits a valid png data url", () => {
    const out = parseImageDataUrl("data:image/png;base64,AAAB");
    expect(out).toEqual({ mediaType: "image/png", data: "AAAB" });
  });

  it("accepts jpeg, webp, and gif", () => {
    expect(parseImageDataUrl("data:image/jpeg;base64,x")?.mediaType).toBe("image/jpeg");
    expect(parseImageDataUrl("data:image/webp;base64,x")?.mediaType).toBe("image/webp");
    expect(parseImageDataUrl("data:image/gif;base64,x")?.mediaType).toBe("image/gif");
  });

  it("rejects non-image and malformed values", () => {
    expect(parseImageDataUrl("data:text/plain;base64,x")).toBeNull();
    expect(parseImageDataUrl("data:image/png;base64,")).toBeNull(); // empty payload
    expect(parseImageDataUrl("not a data url")).toBeNull();
    expect(parseImageDataUrl(null)).toBeNull();
    expect(parseImageDataUrl(undefined)).toBeNull();
    expect(parseImageDataUrl(42)).toBeNull();
  });
});

describe("parseModelJson", () => {
  it("parses bare JSON", () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips a ```json fence", () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("strips a plain ``` fence", () => {
    expect(parseModelJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("recovers JSON wrapped in prose", () => {
    expect(parseModelJson('Sure! Here you go: {"a":1} hope that helps')).toEqual({ a: 1 });
  });

  it("handles nested objects when recovering", () => {
    expect(parseModelJson('prefix {"a":{"b":2},"c":[1,2]} suffix')).toEqual({
      a: { b: 2 },
      c: [1, 2],
    });
  });

  it("returns null for unparseable text", () => {
    expect(parseModelJson("no json at all")).toBeNull();
    expect(parseModelJson("{ not valid }")).toBeNull();
  });
});

describe("clampPoint", () => {
  it("passes through in-range coordinates", () => {
    expect(clampPoint({ x: 0.5, y: 0.6, label: "Button" })).toEqual({
      x: 0.5,
      y: 0.6,
      label: "Button",
    });
  });

  it("clamps out-of-range coordinates to [0,1]", () => {
    expect(clampPoint({ x: 1.4, y: -0.2, label: "x" })).toEqual({ x: 1, y: 0, label: "x" });
  });

  it("falls back to center for non-numeric coordinates", () => {
    expect(clampPoint({ x: "nope", y: null, label: "x" })).toEqual({ x: 0.5, y: 0.5, label: "x" });
  });

  it("defaults a missing label to empty string", () => {
    expect(clampPoint({ x: 0.1, y: 0.1 })).toEqual({ x: 0.1, y: 0.1, label: "" });
  });

  it("returns null for null/invalid input", () => {
    expect(clampPoint(null)).toBeNull();
    expect(clampPoint("nope")).toBeNull();
    expect(clampPoint(undefined)).toBeNull();
  });
});

describe("isSafeLaunchTarget", () => {
  it("accepts the forms the model is told to produce", () => {
    expect(isSafeLaunchTarget("spotify")).toBe(true);
    expect(isSafeLaunchTarget("ms-settings:")).toBe(true);
    expect(isSafeLaunchTarget("https://gmail.com")).toBe(true);
    expect(isSafeLaunchTarget("https://www.google.com/search?q=weather+today")).toBe(true);
  });

  it("rejects whitespace, which is how extra arguments would be smuggled in", () => {
    expect(isSafeLaunchTarget("notepad file.txt")).toBe(false);
    expect(isSafeLaunchTarget("notepad\tfile.txt")).toBe(false);
    expect(isSafeLaunchTarget("calc\r\nshutdown")).toBe(false);
  });

  it("rejects empty, oversized, and non-string targets", () => {
    expect(isSafeLaunchTarget("")).toBe(false);
    expect(isSafeLaunchTarget("a".repeat(400))).toBe(false);
    expect(isSafeLaunchTarget(null)).toBe(false);
    expect(isSafeLaunchTarget(undefined)).toBe(false);
    expect(isSafeLaunchTarget(42)).toBe(false);
  });
});

describe("normalizeActions", () => {
  const click = { kind: "click", label: "ok", x: 0.5, y: 0.5 };

  it("returns an empty list for anything that is not an array", () => {
    expect(normalizeActions(undefined)).toEqual([]);
    expect(normalizeActions(null)).toEqual([]);
    expect(normalizeActions("click")).toEqual([]);
    expect(normalizeActions({ kind: "click" })).toEqual([]);
  });

  it("keeps a well-formed click and drops an unknown kind", () => {
    expect(normalizeActions([click, { kind: "explode", label: "no", x: 0.1, y: 0.1 }])).toEqual([
      { kind: "click", label: "ok", x: 0.5, y: 0.5 },
    ]);
  });

  it("clamps coordinates into frame", () => {
    const [a] = normalizeActions([{ kind: "click", label: "x", x: 9, y: -4 }]);
    expect(a).toMatchObject({ x: 1, y: 0 });
  });

  // A pointer action with no coordinates is dropped rather than defaulted:
  // a click at the centre of the screen is still a click on something.
  it("drops pointer actions with missing or unusable coordinates", () => {
    expect(normalizeActions([{ kind: "click", label: "x" }])).toEqual([]);
    expect(normalizeActions([{ kind: "click", label: "x", x: "left", y: 0.2 }])).toEqual([]);
    expect(normalizeActions([{ kind: "drag", label: "x", x: 0.1, y: 0.1 }])).toEqual([]);
  });

  it("keeps a drag only when it has somewhere to land", () => {
    const out = normalizeActions([
      { kind: "drag", label: "clip", x: 0.1, y: 0.2, to: { x: 0.8, y: 0.9 } },
    ]);
    expect(out).toEqual([
      { kind: "drag", label: "clip", x: 0.1, y: 0.2, to: { x: 0.8, y: 0.9 } },
    ]);
  });

  it("requires real text to type", () => {
    expect(normalizeActions([{ kind: "type", label: "q", text: "" }])).toEqual([]);
    expect(normalizeActions([{ kind: "type", label: "q", text: 12 }])).toEqual([]);
    expect(normalizeActions([{ kind: "type", label: "q", text: "hello" }])).toEqual([
      { kind: "type", label: "q", text: "hello" },
    ]);
  });

  it("caps typed text so one action cannot hold the run open forever", () => {
    const [a] = normalizeActions([{ kind: "type", label: "q", text: "a".repeat(5000) }]);
    expect(a.text).toHaveLength(2000);
  });

  // The executor dispatches through Invoke-Expression, so a combo that could
  // close the PowerShell string must never get that far.
  it("rejects key combos outside the allowed alphabet", () => {
    expect(normalizeActions([{ kind: "key", label: "k", combo: "'; calc; '" }])).toEqual([]);
    expect(normalizeActions([{ kind: "key", label: "k", combo: "ctrl+$(x)" }])).toEqual([]);
    expect(normalizeActions([{ kind: "key", label: "k", combo: "a".repeat(60) }])).toEqual([]);
    expect(normalizeActions([{ kind: "key", label: "k", combo: "CTRL+I" }])).toEqual([
      { kind: "key", label: "k", combo: "ctrl+i" },
    ]);
  });

  it("defaults scroll notches and truncates a fractional one", () => {
    expect(normalizeActions([{ kind: "scroll", label: "s", x: 0.5, y: 0.5 }])[0].notches).toBe(-3);
    expect(
      normalizeActions([{ kind: "scroll", label: "s", x: 0.5, y: 0.5, notches: 2.7 }])[0].notches,
    ).toBe(2);
  });

  // A coordinate is read off a screenshot that is already slightly stale. One
  // is fine; a second was chosen before the first action moved the page.
  it("keeps only the first positional action and truncates there", () => {
    const out = normalizeActions([
      { kind: "click", label: "box", x: 0.2, y: 0.2 },
      { kind: "click", label: "result", x: 0.6, y: 0.6 },
      { kind: "key", label: "go", combo: "enter" },
    ]);
    expect(out).toEqual([{ kind: "click", label: "box", x: 0.2, y: 0.2 }]);
  });

  it("lets focus-relative actions chain after one positional action", () => {
    const out = normalizeActions([
      { kind: "click", label: "search box", x: 0.5, y: 0.1 },
      { kind: "type", label: "query", text: "soccer" },
      { kind: "key", label: "go", combo: "enter" },
    ]);
    expect(out.map((a) => a.kind)).toEqual(["click", "type", "key"]);
  });

  it("caps a run at five actions", () => {
    // focus-relative, so the positional guard is not what does the trimming
    expect(normalizeActions(Array(9).fill({ kind: "key", label: "k", combo: "a" }))).toHaveLength(5);
  });
});
