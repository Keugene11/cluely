import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { anthropic, MODEL, GUIDE_SYSTEM } from "@/lib/claude";
import { clampPoint, parseImageDataUrl, parseModelJson, type Point } from "@/lib/parse";

export const maxDuration = 60;

export type GuideResult = {
  say: string;
  steps: string[];
  point: Point | null;
};

/**
 * The teach/guide path: reads the user's screen and returns spoken guidance,
 * a short plan, and where on screen to point the cursor next.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { question, image } = await req.json();
  const parsed = parseImageDataUrl(image);

  if (!parsed) {
    return NextResponse.json(
      { error: "Guiding needs a screenshot — this only works in the desktop app." },
      { status: 400 },
    );
  }

  const ask = String(question ?? "").trim();

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "image",
      source: { type: "base64", media_type: parsed.mediaType, data: parsed.data },
    },
    {
      type: "text",
      text: ask
        ? `The user asks: ${ask}`
        : "The user asked for help with what's on screen but didn't say what. Guide them on the most useful next step for whatever they're working on.",
    },
  ];

  let response;
  try {
    response = await anthropic().messages.create({
      model: MODEL,
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
    steps: Array.isArray(parsedResult.steps) ? parsedResult.steps.map(String) : [],
    point: clampPoint(parsedResult.point),
  };

  return NextResponse.json({ result });
}
