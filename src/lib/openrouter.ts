/**
 * Every model call Otto makes goes through OpenRouter, server-side. The desktop
 * app is a shell around the hosted site, so the key lives only in Vercel's env
 * (OPENROUTER_API_KEY) and never ships in the installer.
 *
 * One cheap, fast, vision-capable model with tool calling: Gemini Flash-Lite
 * with reasoning off reads a screenshot, picks a tool, and answers in a second
 * or two for fractions of a cent. DeepSeek V4.1 Flash (also vision + tools) is
 * the fallback — the `models` list lets OpenRouter fail over by itself when the
 * first is down or rate-limited. Override with OTTO_MODELS (comma-separated).
 */
export const MODELS = (process.env.OTTO_MODELS || process.env.DEMO_MODELS || "google/gemini-3.1-flash-lite,deepseek/deepseek-v4.1-flash")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

type Part =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type Image = { mediaType: string; data: string };

/** A tool in the shape the prompts define it (name/description/input_schema). */
export type ToolDef = { name: string; description: string; input_schema: object };

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; input: Record<string, unknown> };

function userContent(text: string, image?: Image | null): Part[] {
  const content: Part[] = [];
  // Screenshot first so the model reads it as context for the question.
  if (image) content.push({ type: "image_url", image_url: { url: `data:${image.mediaType};base64,${image.data}` } });
  content.push({ type: "text", text });
  return content;
}

async function post(body: Record<string, unknown>, timeoutMs = 55_000) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://cluely-delta.vercel.app",
      "X-Title": "Otto",
    },
    body: JSON.stringify({ models: MODELS, reasoning: { enabled: false }, ...body }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }
  return res;
}

/**
 * Stream a completion: text chunks as they arrive, and each tool call once its
 * arguments have fully streamed in. Throws before the first event if no model
 * would answer, so the caller can report it.
 */
export async function* streamChat(opts: {
  system: string;
  text: string;
  image?: Image | null;
  maxTokens: number;
  tools?: ToolDef[];
}): AsyncGenerator<StreamEvent> {
  const tools = opts.tools?.length
    ? opts.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }))
    : undefined;

  const res = await post({
    stream: true,
    max_tokens: opts.maxTokens,
    ...(tools ? { tools, tool_choice: "auto" } : {}),
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: userContent(opts.text, opts.image) },
    ],
  });
  if (!res.body) throw new Error("OpenRouter returned no body");

  // Tool arguments stream as JSON fragments, keyed by the call's index.
  const pending = new Map<number, { name: string; args: string }>();
  const flush = function* (): Generator<StreamEvent> {
    for (const [, call] of [...pending].sort((a, b) => a[0] - b[0])) {
      const input = parseArgs(call.args);
      if (call.name && input) yield { type: "tool", name: call.name, input };
    }
    pending.clear();
  };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      // SSE comments (": OPENROUTER PROCESSING") keep the connection alive.
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        yield* flush();
        return;
      }
      let event: {
        error?: { message?: string };
        choices?: {
          delta?: {
            content?: string | null;
            tool_calls?: { index?: number; function?: { name?: string; arguments?: string } }[];
          };
        }[];
      };
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }
      if (event.error) throw new Error(`OpenRouter: ${event.error.message ?? "stream error"}`);
      const delta = event.choices?.[0]?.delta;
      if (delta?.content) yield { type: "text", text: delta.content };
      for (const tc of delta?.tool_calls ?? []) {
        const idx = tc.index ?? 0;
        const slot = pending.get(idx) ?? { name: "", args: "" };
        if (tc.function?.name) slot.name = tc.function.name;
        if (tc.function?.arguments) slot.args += tc.function.arguments;
        pending.set(idx, slot);
      }
    }
  }
  yield* flush();
}

function parseArgs(json: string): Record<string, unknown> | null {
  // Some providers send a complete call with empty arguments for "{}".
  if (!json.trim()) return {};
  try {
    const value = JSON.parse(json);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Stream plain text only (the public demo: no tools). */
export async function* streamDemo(opts: {
  system: string;
  text: string;
  image?: Image | null;
  maxTokens: number;
}): AsyncGenerator<string> {
  for await (const e of streamChat(opts)) if (e.type === "text") yield e.text;
}

/** One non-streamed completion that should come back as a JSON object. */
export async function completeJson(opts: {
  system: string;
  text: string;
  image?: Image | null;
  maxTokens: number;
}): Promise<string> {
  const res = await post({
    max_tokens: opts.maxTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: userContent(opts.text, opts.image) },
    ],
  });
  const json = (await res.json()) as {
    error?: { message?: string };
    choices?: { message?: { content?: string | null } }[];
  };
  if (json.error) throw new Error(`OpenRouter: ${json.error.message ?? "error"}`);
  return json.choices?.[0]?.message?.content ?? "";
}
