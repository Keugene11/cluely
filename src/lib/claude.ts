import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5";

let client: Anthropic | null = null;

export function anthropic() {
  if (client) return client;
  try {
    // With no explicit key the SDK falls back to ANTHROPIC_API_KEY,
    // ANTHROPIC_AUTH_TOKEN, or a local `ant auth login` profile.
    client = process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : new Anthropic();
  } catch {
    throw new Error("No Anthropic credentials found — set ANTHROPIC_API_KEY in .env.local.");
  }
  return client;
}

/** Persona the live assistant answers with. Kept stable so the prefix stays cacheable. */
export const LIVE_SYSTEM = `You are a live meeting copilot. The user is in a real conversation right now and is reading you on a small overlay while someone talks to them.

Rules:
- Answer in under 80 words. No preamble, no "great question", no restating the prompt.
- Lead with the answer. Follow with at most three short bullets they can say out loud.
- Write in the user's voice — plain, confident, speakable sentences.
- Use the transcript to resolve pronouns and references. If the transcript is thin, answer from general knowledge instead of asking for clarification.
- If a number, name, or fact is not in the context, say so in four words rather than inventing it.
- Markdown: bullets and **bold** only. Never headings, never code fences unless the answer is code.`;

export const NOTES_SYSTEM = `You write meeting notes from a raw, imperfect speech-to-text transcript.

Return JSON only, matching exactly:
{"summary": string, "key_points": string[], "action_items": [{"owner": string, "task": string}], "follow_up_email": string}

- summary: 2-3 sentences on what the meeting was actually about and what was decided.
- key_points: 3-6 bullets, each a full statement, no filler.
- action_items: only commitments that were actually made. owner is a name from the transcript, or "me" / "them" when unnamed. Empty array if none.
- follow_up_email: a short, sendable email from the user to the other participants. No subject line, no placeholders in brackets.
- Transcription errors are expected — infer intent, never quote a garbled phrase.`;
