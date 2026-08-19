import type Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { anthropic, MODEL, LIVE_SYSTEM } from "@/lib/claude";

export const maxDuration = 60;

const IMAGE_RE = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/;

/**
 * The Ctrl/Cmd+Enter path: takes the live transcript tail plus an optional typed
 * question and streams an answer back as plain text chunks.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { sessionId, question, transcript, image } = await req.json();

  const files = await sql`
    select name, content from context_files where user_id = ${user.id} order by created_at desc limit 5
  `;
  const context = files
    .map((f) => `--- ${f.name} ---\n${String(f.content).slice(0, 8000)}`)
    .join("\n\n");

  const tail = String(transcript ?? "").slice(-6000);
  const ask = String(question ?? "").trim();

  const match = typeof image === "string" ? image.match(IMAGE_RE) : null;
  const hasScreen = Boolean(match);

  const prompt = [
    context && `What the user gave you ahead of the call:\n${context}`,
    tail ? `Live transcript (most recent last):\n${tail}` : "Live transcript: (nothing captured yet)",
    hasScreen
      ? "A screenshot of the user's screen right now is attached — read it and use it."
      : null,
    ask
      ? `The user typed: ${ask}`
      : "The user hit the hotkey with no typed question — answer whatever was just asked of them, on screen or in the transcript.",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Vision: put the screenshot before the text so Claude reads it as context.
  const content: Anthropic.ContentBlockParam[] = [];
  if (match) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: match[1] as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
        data: match[2],
      },
    });
  }
  content.push({ type: "text", text: prompt });

  let stream;
  try {
    stream = anthropic().messages.stream({
      model: MODEL,
      max_tokens: 4096, // room for a full, explained coding solution
      system: LIVE_SYSTEM,
      thinking: { type: "adaptive" }, // reason through coding problems before answering
      output_config: { effort: "medium" },
      messages: [{ role: "user", content }],
    });
  } catch {
    return new Response(
      "Cluely has no Anthropic credentials. Add ANTHROPIC_API_KEY to .env.local and restart.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const encoder = new TextEncoder();
  let answer = "";

  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            answer += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        console.error("assist stream failed", err);
        controller.enqueue(encoder.encode("\n\nThe assist cut out. Try the hotkey again."));
      } finally {
        controller.close();
        if (sessionId && answer) {
          await sql`
            insert into assists (session_id, question, answer)
            values (${sessionId}, ${ask}, ${answer})
          `.catch(() => {});
        }
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
