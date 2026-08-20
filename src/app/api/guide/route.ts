import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { anthropic, GUIDE_MODEL, GUIDE_SYSTEM } from "@/lib/claude";
import {
  clampPoint,
  normalizeActions,
  parseImageDataUrl,
  parseModelJson,
  type Action,
  type Point,
} from "@/lib/parse";

export const maxDuration = 60;

export type GuideResult = {
  say: string;
  steps: string[];
  point: Point | null;
  /** Ordered things to actually do for this step; empty when a click is enough. */
  actions: Action[];
  /** What should be visibly true on screen once this step has worked. */
  expect: string;
  /** Whether the PREVIOUS step's expectation came true. Null on the first turn. */
  happened: boolean | null;
  done: boolean;
};

/**
 * The teach/guide path: reads the user's screen and returns spoken guidance,
 * a short plan, and where on screen to point the cursor next.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { question, image, goal, steps, stepIndex, verify, attempt } = await req.json();
  const parsed = parseImageDataUrl(image);

  if (!parsed) {
    return NextResponse.json(
      { error: "Guiding needs a screenshot — this only works in the desktop app." },
      { status: 400 },
    );
  }

  const ask = String(question ?? "").trim();
  const plan = Array.isArray(steps) ? (steps as string[]) : [];
  const continuing = plan.length > 0 && Number.isInteger(stepIndex);

  // Build the instruction: initial ask vs. continuing a walkthrough on a fresh
  // screenshot (the screen has changed since the user did the previous step).
  let instruction: string;
  const expected = String(verify ?? "").trim();
  const tries = Number.isInteger(attempt) ? (attempt as number) : 0;

  if (continuing) {
    const idx = Math.max(0, Math.min(stepIndex as number, plan.length - 1));
    instruction = [
      `The user is being walked through this goal: "${String(goal ?? "").trim() || ask}".`,
      `The plan is:\n${plan.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
      `They have done the earlier steps. They are now on step ${idx + 1}: "${plan[idx]}".`,
      // Checking the previous step comes before planning the next one, so a
      // step that quietly did nothing is caught here rather than becoming a
      // wrong starting point for everything after it.
      expected
        ? [
            `FIRST, check the previous action. It should have made this true: "${expected}".`,
            "Look at the screenshot and set \"happened\" to true only if that is now visibly the case, false if it is not.",
            tries > 0
              ? `This step has already been attempted ${tries + 1} times without that becoming true. Do not repeat the same click — the target is wrong, hidden behind something, or needs a different interaction (a double-click for an icon, a menu opened first). Aim somewhere different or say plainly that it is not working.`
              : "If it did not happen, stay on this same step and try a different way of doing it rather than moving on.",
          ].join("\n")
        : 'Set "happened" to null — there is nothing to check yet.',
      "THEN look at the FRESH screenshot and point at the element for this step. If the task now looks complete, set done to true.",
      // The client keeps the original plan (see `continuing` below), so anything
      // returned here is thrown away. Every step of a walkthrough was paying to
      // regenerate it, and those tokens are on the critical path between one
      // click and the next.
      'Return "steps" as an empty array — the plan is already on screen and will not be re-read.',
    ].join("\n\n");
  } else {
    instruction = ask
      ? `The user asks: ${ask}`
      : "The user asked for help with what's on screen but didn't say what. Guide them on the most useful next step for whatever they're working on.";
  }

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "image",
      source: { type: "base64", media_type: parsed.mediaType, data: parsed.data },
    },
    { type: "text", text: instruction },
  ];

  let response;
  try {
    response = await anthropic().messages.create({
      model: GUIDE_MODEL,
      max_tokens: 900, // the per-step JSON is small; steps are not re-sent
      system: GUIDE_SYSTEM,
      // No extended thinking here, deliberately. A step is perception — read the
      // screenshot, name the control, say whether the last action landed — and it
      // sits between one click and the next, where latency is the whole
      // experience. Thinking was costing seconds per step for a judgement the
      // model makes correctly without it.
      output_config: { effort: "low" },
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    console.error("guide failed", err);
    return NextResponse.json(
      { error: "Could not reach Claude. Check ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");

  const parsedResult = parseModelJson<GuideResult>(text);
  if (!parsedResult) {
    return NextResponse.json({ error: "Could not read the guidance." }, { status: 502 });
  }

  const result: GuideResult = {
    say: typeof parsedResult.say === "string" ? parsedResult.say : "",
    // On a continuation, keep the original plan so the step list stays stable.
    steps: continuing ? plan : Array.isArray(parsedResult.steps) ? parsedResult.steps.map(String) : [],
    point: clampPoint(parsedResult.point),
    actions: normalizeActions(parsedResult.actions),
    expect: typeof parsedResult.expect === "string" ? parsedResult.expect.slice(0, 300) : "",
    // Only a real boolean counts. A missing or malformed value must not read as
    // "yes it happened" — an unverified step is treated as unverified.
    happened: typeof parsedResult.happened === "boolean" ? parsedResult.happened : null,
    done: Boolean(parsedResult.done),
  };

  return NextResponse.json({ result });
}
