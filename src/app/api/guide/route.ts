import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { anthropic, GUIDE_MODEL, GUIDE_SYSTEM } from "@/lib/claude";
import { clampPoint, parseImageDataUrl, parseModelJson, type Point } from "@/lib/parse";

export const maxDuration = 60;

export type GuideResult = {
  say: string;
  steps: string[];
  point: Point | null;
  done: boolean;
};

/**
 * The teach/guide path: reads the user's screen and returns spoken guidance,
 * a short plan, and where on screen to point the cursor next.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { question, image, goal, steps, stepIndex } = await req.json();
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
  if (continuing) {
    const idx = Math.max(0, Math.min(stepIndex as number, plan.length - 1));
    instruction = [
      `The user is being walked through this goal: "${String(goal ?? "").trim() || ask}".`,
      `The plan is:\n${plan.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
      `They have done the earlier steps. They are now on step ${idx + 1}: "${plan[idx]}".`,
      "Look at the FRESH screenshot and point at the element for this step. If the task now looks complete, set done to true.",
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
      max_tokens: 2500, // headroom so adaptive thinking can't truncate the JSON
      system: GUIDE_SYSTEM,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
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
    done: Boolean(parsedResult.done),
  };

  return NextResponse.json({ result });
}
