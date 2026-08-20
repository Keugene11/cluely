import type Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { anthropic, MODEL, ROUTER_SYSTEM, ASK_TOOLS } from "@/lib/claude";
import { clampPoint, isSafeLaunchTarget, normalizeActions, parseImageDataUrl } from "@/lib/parse";
import { clientIp, sweepDemoAsks, takeDemoQuota, DEMO_MAX_IMAGE, DEMO_MAX_QUESTION } from "@/lib/demo";

export const maxDuration = 60;

/**
 * The user's uploaded context, briefly cached per warm instance.
 *
 * This query sits directly in front of the Claude call on every single ask, so
 * its round trip is dead time the user waits through before the first token.
 * Context files change on the order of days; asks come seconds apart. Ten
 * seconds is short enough that a file uploaded mid-session shows up on the next
 * question or two, and long enough to cover a burst of asks.
 */
const CONTEXT_TTL_MS = 10_000;
const contextCache = new Map<string, { at: number; value: string }>();

async function contextFor(userId: string): Promise<string> {
  const hit = contextCache.get(userId);
  if (hit && Date.now() - hit.at < CONTEXT_TTL_MS) return hit.value;

  const files = await sql`
    select name, content from context_files where user_id = ${userId} order by created_at desc limit 5
  `;
  const value = files
    .map((f) => `--- ${f.name} ---\n${String(f.content).slice(0, 8000)}`)
    .join("\n\n");

  // One entry per user, and an instance only ever serves a handful — but bound
  // it anyway so a long-lived instance cannot grow without limit.
  if (contextCache.size > 64) contextCache.clear();
  contextCache.set(userId, { at: Date.now(), value });
  return value;
}

/**
 * The dispatcher. One request decides what the user wanted instead of making
 * them pick a mode first: Claude either streams a text answer (the common
 * case) or calls a tool to start a walkthrough or launch something.
 *
 * The response is newline-delimited JSON so the client can tell those apart
 * mid-stream. Text arrives token by token, exactly as fast as the old
 * assist-only route, because routing is the same call — not a hop before it.
 *
 * Events, one per line:
 *   {"t":"text","v":"…"}     a chunk of the answer
 *   {"t":"guide","v":{…}}    start a walkthrough (say/steps/point/done)
 *   {"t":"open","v":{…}}     launch something (say/target/label/explicit)
 *   {"t":"error","v":"…"}    something went wrong mid-stream
 */
export async function POST(req: Request) {
  const { sessionId, question, transcript, image, demo } = await req.json();

  // The public demo answers without an account. It is the same dispatcher and
  // the same model — what it gives up is everything that belongs to a user
  // (their uploaded context, their session log) and everything the browser
  // cannot do anyway (walkthroughs, launching apps), plus a budget.
  const user = await getUser();
  const isDemo = !user && demo === true;
  if (!user && !isDemo) return new Response("Unauthorized", { status: 401 });

  if (isDemo) {
    const quota = await takeDemoQuota(clientIp(req));
    if (!quota.ok) {
      return new Response(JSON.stringify({ t: "error", v: quota.message }) + "\n", {
        status: 429,
        headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
      });
    }
    void sweepDemoAsks();
  }

  const context = user ? await contextFor(user.id) : "";

  const tail = isDemo ? "" : String(transcript ?? "").slice(-6000);
  const ask = String(question ?? "")
    .trim()
    .slice(0, isDemo ? DEMO_MAX_QUESTION : Infinity);

  const rawImage = isDemo && typeof image === "string" && image.length > DEMO_MAX_IMAGE ? null : image;
  const parsedImage = parseImageDataUrl(rawImage);
  const hasScreen = Boolean(parsedImage);

  const prompt = [
    context && `What the user gave you ahead of the call:\n${context}`,
    isDemo
      ? "This is the public demo: no microphone, no transcript, and no control of the machine. Answer what you are asked, using the screenshot if one is attached. If you are asked to click something or open an app, say plainly that doing it needs the desktop app, then explain how to do it by hand."
      : tail
        ? `Live transcript (most recent last):\n${tail}`
        : "Live transcript: (nothing captured yet)",
    hasScreen
      ? "A screenshot of the user's screen right now is attached — read it and use it."
      : "No screenshot is available, so the guide tool is not usable this turn.",
    ask
      ? `The user said: ${ask}`
      : "The user hit the hotkey with no typed question — answer whatever was just asked of them, on screen or in the transcript.",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Vision: put the screenshot before the text so Claude reads it as context.
  const content: Anthropic.ContentBlockParam[] = [];
  if (parsedImage) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: parsedImage.mediaType, data: parsedImage.data },
    });
  }
  content.push({ type: "text", text: prompt });

  let stream;
  try {
    stream = anthropic().messages.stream({
      model: MODEL,
      // The demo has a budget and no session to carry a long answer into, so it
      // gets a shorter one. Everything else about the call is the real thing.
      max_tokens: isDemo ? 1200 : 4096, // room for a full, explained coding solution
      system: ROUTER_SYSTEM,
      // Without a screenshot there is nothing to point at, so drop the guide
      // tool entirely rather than relying on the prompt to hold the line.
      //
      // The demo drops both tools: a browser tab cannot move the mouse or
      // launch anything, and a walkthrough that offers to click for you and
      // then cannot is a worse demo than one that never offers.
      tools: (isDemo
        ? []
        : hasScreen
          ? ASK_TOOLS
          : ASK_TOOLS.filter((t) => t.name !== "guide")) as Anthropic.Tool[],
      tool_choice: { type: "auto" },
      thinking: { type: "adaptive" }, // reason through coding problems before answering
      output_config: { effort: isDemo ? "low" : "medium" },
      messages: [{ role: "user", content }],
    });
  } catch {
    return new Response(
      JSON.stringify({
        t: "error",
        v: "Otto has no Anthropic credentials. Add ANTHROPIC_API_KEY to .env.local and restart.",
      }) + "\n",
      { status: 503, headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } },
    );
  }

  const encoder = new TextEncoder();
  let answer = "";

  const body = new ReadableStream({
    async start(controller) {
      const send = (t: string, v: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify({ t, v }) + "\n"));

      // Tool inputs stream in as partial JSON fragments; accumulate per block.
      const pending = new Map<number, { name: string; json: string }>();

      try {
        for await (const event of stream) {
          if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
            pending.set(event.index, { name: event.content_block.name, json: "" });
          } else if (event.type === "content_block_delta") {
            if (event.delta.type === "text_delta") {
              answer += event.delta.text;
              send("text", event.delta.text);
            } else if (event.delta.type === "input_json_delta") {
              const slot = pending.get(event.index);
              if (slot) slot.json += event.delta.partial_json;
            }
          } else if (event.type === "content_block_stop") {
            const slot = pending.get(event.index);
            if (!slot) continue;
            pending.delete(event.index);
            const parsed = safeParse(slot.json);
            if (!parsed) continue;
            if (slot.name === "guide") send("guide", normalizeGuide(parsed));
            else if (slot.name === "open") send("open", normalizeOpen(parsed));
          }
        }
      } catch (err) {
        console.error("ask stream failed", err);
        send("error", "That cut out. Try again.");
      } finally {
        // Only text answers belong in the session log; a launch or a walkthrough
        // is not a transcript-worthy Q&A. This has to finish BEFORE the stream
        // closes — close first and the serverless function can be torn down
        // mid-insert, which silently drops the last answer of every session.
        // `user &&` is load-bearing, not belt-and-braces: without it an
        // unauthenticated demo caller could pass someone else's session id and
        // write rows into their history.
        if (user && sessionId && answer) {
          await sql`
            insert into assists (session_id, question, answer)
            values (${sessionId}, ${ask}, ${answer})
          `.catch(() => {});
        }
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function safeParse(json: string): Record<string, unknown> | null {
  if (!json.trim()) return null;
  try {
    const value = JSON.parse(json);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Same shape /api/guide returns, so the client renders both identically. */
function normalizeGuide(input: Record<string, unknown>) {
  return {
    say: typeof input.say === "string" ? input.say : "",
    steps: Array.isArray(input.steps) ? input.steps.map(String) : [],
    point: clampPoint(input.point),
    actions: normalizeActions(input.actions),
    expect: typeof input.expect === "string" ? input.expect.slice(0, 300) : "",
    happened: null, // nothing has been attempted yet on the opening turn
    done: Boolean(input.done),
  };
}

/**
 * An unsafe target degrades to an explanation rather than an error — the user
 * asked for something, they should hear why it did not happen.
 */
function normalizeOpen(input: Record<string, unknown>) {
  const target = input.target;
  if (!isSafeLaunchTarget(target)) {
    return {
      say: "I can only open apps, sites, and searches.",
      target: null,
      label: "",
      explicit: false,
    };
  }
  return {
    say: typeof input.say === "string" ? input.say : "",
    target,
    label: typeof input.label === "string" ? input.label : "",
    // Default to needing confirmation: a missing flag must never auto-launch.
    explicit: input.explicit === true,
  };
}
