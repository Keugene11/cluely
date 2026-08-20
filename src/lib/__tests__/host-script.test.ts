import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Windows input host is C# embedded in a PowerShell here-string, embedded
 * in turn inside a JS template literal in electron/executor.js. That is three
 * levels of quoting, and JS gets first pass at every backslash.
 *
 * Writing '\n' in that C# looks right and is not: JS turns it into a real line
 * break, C# sees a newline inside a character constant, Add-Type fails, and the
 * host dies on startup — so every click and keystroke reports "The input helper
 * stopped" while the source still reads perfectly.
 *
 * These assertions run against the string the app actually generates, not
 * against the file as written, because that difference is the whole bug.
 */
function generatedHostScript(): string {
  const src = readFileSync(join(process.cwd(), "electron", "executor.js"), "utf8");
  const match = src.match(/const HOST_SCRIPT = (`[\s\S]*?`);\n/);
  if (!match) throw new Error("HOST_SCRIPT not found in electron/executor.js");
  // Evaluating the literal is the point: we need what JS produces, which is
  // what gets written to disk and run.
  return eval(match[1]) as string;
}

describe("generated input host script", () => {
  const script = generatedHostScript();

  it("is produced at all", () => {
    expect(script.length).toBeGreaterThan(1000);
    expect(script).toContain("OTTO-READY");
  });

  // The failure mode: a single-quoted constant left open at end of line.
  it("has no character constant broken by a real newline", () => {
    const offenders = script
      .split("\n")
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /'[^']*$/.test(line) && /==\s*'[^']*$/.test(line));
    expect(offenders.map((o) => `${o.n}: ${o.line.trim()}`)).toEqual([]);
  });

  it("keeps the newline comparison escaped for C#", () => {
    // Written with String.raw and character codes rather than an escape, because
    // an assertion about backslashes is itself easy to mangle — the first
    // version of this test matched a real newline and passed for the wrong
    // reason. 92 is backslash, 110 is "n".
    const line = script.split("\n").find((l) => l.includes("VK_RETURN")) ?? "";
    const escaped = String.fromCharCode(39, 92, 110, 39); // '\n' as four chars
    expect(line).toContain(escaped);
    expect(line).not.toContain(String.fromCharCode(39, 10)); // a real line break
  });

  it("still declares everything the executor calls", () => {
    for (const method of [
      "MakeDpiAware", "Glide", "Click", "DoubleClick", "Drag", "Scroll", "TypeB64", "Combo", "Pos",
    ]) {
      expect(script).toContain(method);
    }
  });
});
