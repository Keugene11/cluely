import { describe, expect, it } from "vitest";
import { clampPoint, parseImageDataUrl, parseModelJson } from "@/lib/parse";

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
