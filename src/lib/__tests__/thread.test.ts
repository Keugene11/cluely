import { describe, expect, it } from "vitest";
import { applyTextDeltas, type Entry } from "@/lib/thread";

const text = (answer: string, done = false): Entry => ({
  kind: "text",
  question: "q",
  answer,
  done,
});

const guide = (): Entry => ({
  kind: "guide",
  question: "q",
  result: { say: "click that", steps: ["one", "two"], point: null, done: false },
  step: 0,
  working: false,
  clicking: false,
  auto: false,
  error: null,
  done: false,
});

describe("applyTextDeltas", () => {
  it("appends a buffered delta to the row it belongs to", () => {
    const out = applyTextDeltas([text("Hello")], new Map([[0, " world"]]));
    expect(out[0]).toMatchObject({ kind: "text", answer: "Hello world" });
  });

  it("streams the same answer as a per-token apply would", () => {
    // The whole point of buffering is that it must be indistinguishable from
    // applying every delta the moment it lands.
    const answer = "We can do this in one pass with a hash map, trading space for time.";
    const deltas: string[] = [];
    for (let i = 0; i < answer.length; i += 4) deltas.push(answer.slice(i, i + 4));

    let perToken: Entry[] = [text("")];
    for (const d of deltas) perToken = applyTextDeltas(perToken, new Map([[0, d]]));

    // Now the same deltas, coalesced into flushes of 8.
    let coalesced: Entry[] = [text("")];
    for (let i = 0; i < deltas.length; i += 8) {
      coalesced = applyTextDeltas(coalesced, new Map([[0, deltas.slice(i, i + 8).join("")]]));
    }

    expect((coalesced[0] as { answer: string }).answer).toBe(answer);
    expect(coalesced[0]).toEqual(perToken[0]);
  });

  it("applies deltas to several rows in one pass", () => {
    const out = applyTextDeltas(
      [text("a"), text("b"), text("c")],
      new Map([
        [0, "1"],
        [2, "3"],
      ]),
    );
    expect(out.map((e) => (e as { answer: string }).answer)).toEqual(["a1", "b", "c3"]);
  });

  it("keeps the identity of rows it did not touch, so memoized cards skip re-render", () => {
    const untouched = text("stays put");
    const entries = [text("grows"), untouched];
    const out = applyTextDeltas(entries, new Map([[0, "!"]]));

    expect(out[1]).toBe(untouched); // same reference, not a copy
    expect(out[0]).not.toBe(entries[0]);
  });

  it("drops a delta whose row became a tool result instead of corrupting it", () => {
    // A tool call can rewrite the row a text answer was heading for.
    const row = guide();
    const out = applyTextDeltas([row], new Map([[0, "orphaned text"]]));
    expect(out[0]).toBe(row);
  });

  it("ignores a delta for a row that no longer exists", () => {
    const entries = [text("only one")];
    expect(applyTextDeltas(entries, new Map([[5, "nowhere"]]))).toEqual(entries);
  });

  it("returns the original array when there is nothing pending", () => {
    const entries = [text("unchanged")];
    expect(applyTextDeltas(entries, new Map())).toBe(entries);
  });
});
