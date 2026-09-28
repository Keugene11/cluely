/**
 * The public demo's model: a cheap, fast, vision-capable model on OpenRouter.
 *
 * The demo is an open door on a portfolio page, so it should cost fractions of
 * a cent per question and reply in a second or two. Gemini Flash-Lite with
 * reasoning off does both and still reads a screenshot. DeepSeek is the
 * fallback if the first model is down or rate-limited. The desktop app keeps
 * the Claude dispatcher (tools, walkthroughs); the demo never used tools.
 */
export const DEMO_MODELS = (process.env.DEMO_MODELS || "google/gemini-3.1-flash-lite,deepseek/deepseek-v4.1-flash")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

type Part =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/**
 * Stream a completion as plain text chunks. Throws before the first chunk if
 * no model would answer, so the caller can report it; the `models` list lets
 * OpenRouter fail over to the next one itself.
 */
export async function* streamDemo(opts: {
  system: string;
  text: string;
  image?: { mediaType: string; data: string } | null;
  maxTokens: number;
}): AsyncGenerator<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");

  const content: Part[] = [];
  if (opts.image) {
    content.push({ type: "image_url", image_url: { url: `data:${opts.image.mediaType};base64,${opts.image.data}` } });
  }
  content.push({ type: "text", text: opts.text });

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://cluely-delta.vercel.app",
      "X-Title": "Otto demo",
    },
    body: JSON.stringify({
      models: DEMO_MODELS,
      stream: true,
      max_tokens: opts.maxTokens,
      reasoning: { enabled: false },
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content },
      ],
    }),
    signal: AbortSignal.timeout(55_000),
  });
  if (!res.ok || !res.body) {
    throw new Error(`OpenRouter ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }

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
      if (payload === "[DONE]") return;
      let event: { error?: { message?: string }; choices?: { delta?: { content?: string } }[] };
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }
      if (event.error) throw new Error(`OpenRouter: ${event.error.message ?? "stream error"}`);
      const chunk = event.choices?.[0]?.delta?.content;
      if (chunk) yield chunk;
    }
  }
}
