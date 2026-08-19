import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { anthropic, MODEL, GUIDE_SYSTEM } from "@/lib/claude";

export const maxDuration = 60;

const IMAGE_RE = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/;

export type GuideStep = { instruction: string };
export type GuidePoint = { x: number; y: number; label: string };
export type GuideResult = {
  say: string;
  steps: string[];
  point: GuidePoint | null;
};

/**
 * The teach/guide path: reads the user's screen and returns spoken guidance,
 * a short plan, and where on screen to point the cursor next.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { question, image } = await req.json();
  const match = typeof image === "string" ? image.match(IMAGE_RE) : null;

  if (!match) {
    return NextResponse.json(
      { error: "Guiding needs a screenshot — this only works in the desktop app." },
      { status: 400 },
    );
  }

  const ask = String(question ?? "").trim();

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "image",
      source: {
        type: "base64",
        media_type: match[1] as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
        data: match[2],
      },
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
      max_tokens: 1500,
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

  let result: GuideResult;
  try {
    result = JSON.parse(text.replace(/^```(?:json)?|```$/gm, "").trim());
  } catch {
    return NextResponse.json({ error: "Could not read the guidance." }, { status: 502 });
  }

  // Clamp coordinates so a stray value can never send the cursor off screen.
  if (result.point) {
    result.point.x = Math.min(1, Math.max(0, Number(result.point.x) || 0.5));
    result.point.y = Math.min(1, Math.max(0, Number(result.point.y) || 0.5));
  }

  return NextResponse.json({ result });
}
