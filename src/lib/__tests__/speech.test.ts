import { describe, expect, it } from "vitest";
import { chunk, score, speakable } from "@/lib/speech";

const voice = (name: string, lang = "en-US", localService = true) => ({ name, lang, localService });

describe("speakable", () => {
  it("drops code blocks entirely rather than reading them aloud", () => {
    const text = "Use a hash map.\n\n```python\nfor i in range(10):\n    print(i)\n```\n\nO(n) time.";
    const out = speakable(text);
    expect(out).toBe("Use a hash map. O(n) time.");
    expect(out).not.toContain("print");
  });

  it("strips the markdown punctuation a synthesizer would pronounce", () => {
    expect(speakable("**Bold** and _italic_ and `code`")).toBe("Bold and italic and code");
    expect(speakable("## Heading\n- first\n- second")).toBe("Heading first second");
    expect(speakable("See [the docs](https://example.com)")).toBe("See the docs");
    expect(speakable("> quoted")).toBe("quoted");
  });

  it("survives empty and non-string input", () => {
    expect(speakable("")).toBe("");
    expect(speakable("   \n  ")).toBe("");
    expect(speakable("```only code```")).toBe("");
    expect(speakable(undefined as unknown as string)).toBe("");
  });
});

describe("chunk", () => {
  it("keeps short text as a single utterance", () => {
    expect(chunk("Click the export button.")).toEqual(["Click the export button."]);
  });

  it("splits on sentence boundaries, not mid-word", () => {
    const text = `${"First sentence here. ".repeat(12)}`.trim();
    const parts = chunk(text, 100);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(100);
      expect(p.endsWith(".")).toBe(true);
    }
    expect(parts.join(" ")).toBe(text);
  });

  it("hard-splits a single sentence too long to speak in one go", () => {
    const long = "a".repeat(500);
    const parts = chunk(long, 180);
    expect(parts).toHaveLength(3);
    expect(parts.join("")).toBe(long);
  });

  it("returns nothing for empty input", () => {
    expect(chunk("")).toEqual([]);
    expect(chunk("   ")).toEqual([]);
  });
});

describe("score", () => {
  // The bug this ordering exists to fix: Otto defaulted to "Microsoft David
  // Desktop", the harshest voice on Windows, because the voice list is empty on
  // the first synchronous read.
  it("ranks a natural voice above the old SAPI5 desktop voices", () => {
    expect(score(voice("Microsoft Aria (Natural) - English (United States)"), "en-US")).toBeGreaterThan(
      score(voice("Microsoft David Desktop - English (United States)"), "en-US"),
    );
    expect(score(voice("Microsoft Zira Desktop - English (United States)"), "en-US")).toBeGreaterThan(
      score(voice("Microsoft David Desktop - English (United States)"), "en-US"),
    );
  });

  it("prefers a network voice to a local one", () => {
    expect(score(voice("Google US English", "en-US", false), "en-US")).toBeGreaterThan(
      score(voice("Microsoft Zira Desktop", "en-US"), "en-US"),
    );
  });

  it("puts the wrong language last however nice the voice is", () => {
    expect(score(voice("Microsoft Aria (Natural)", "en-US"), "en-US")).toBeGreaterThan(
      score(voice("Microsoft Denise (Natural)", "fr-FR"), "en-US"),
    );
  });

  it("prefers an exact locale match over a mere language match", () => {
    expect(score(voice("Microsoft Aria", "en-US"), "en-US")).toBeGreaterThan(
      score(voice("Microsoft Aria", "en-GB"), "en-US"),
    );
  });
});
