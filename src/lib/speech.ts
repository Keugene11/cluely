"use client";

/**
 * One place for everything Otto says out loud.
 *
 * This used to be a copy-pasted `speak()` in use-guide and use-act, and it
 * sounded bad for two fixable reasons:
 *
 *  1. `speechSynthesis.getVoices()` returns [] on the first call in Chromium —
 *     the list arrives later, on the `voiceschanged` event. Both copies read it
 *     synchronously, so the very first thing Otto ever said fell back to the
 *     platform default (on Windows: "Microsoft David Desktop", the harsh old
 *     SAPI5 voice). The one utterance that mattered was always the worst one.
 *  2. Nothing stripped markdown, so the voice read "asterisk asterisk" and
 *     whole code blocks out loud.
 *
 * Everything here is best-effort: if the platform has no voices we stay quiet
 * rather than throwing.
 */

const MUTE_KEY = "otto.voice";

/** Read the persisted mute preference. Defaults to on. */
export function loadVoicePref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(MUTE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveVoicePref(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_KEY, enabled ? "on" : "off");
  } catch {
    /* private mode — the toggle still works for this session */
  }
}

/**
 * Score a voice; highest wins. Ordering rationale, best to worst:
 *   - Neural / "Natural" voices (Windows 11 ships Aria, Jenny, Guy, Ryan, Sonia
 *     once the user adds them under Settings, Time & language, Speech).
 *   - Remote voices (`localService === false`) — in a browser these are Google's
 *     network voices, far better than any local SAPI5 voice.
 *   - Named modern voices we know sound acceptable.
 *   - Anything English, preferring the user's exact locale.
 *   - "Desktop"-suffixed SAPI5 voices last: those are the robotic ones.
 */
export function score(voice: { name: string; lang: string; localService: boolean }, locale: string): number {
  const name = voice.name.toLowerCase();
  let n = 0;

  if (/natural|neural/.test(name)) n += 100;
  if (/online/.test(name)) n += 40;
  if (!voice.localService) n += 60;
  if (/\b(aria|jenny|guy|ryan|sonia|libby|michelle|ana)\b/.test(name)) n += 30;
  if (/google/.test(name)) n += 25;
  if (/samantha|karen|moira|serena/.test(name)) n += 20; // decent macOS voices
  if (/zira|mark|hazel/.test(name)) n += 8; // tolerable SAPI5
  if (/desktop/.test(name)) n -= 30; // the old robotic set
  if (/david/.test(name)) n -= 10;

  if (voice.lang === locale) n += 15;
  else if (voice.lang.startsWith(locale.slice(0, 2))) n += 10;
  else if (voice.lang.startsWith("en")) n += 5;
  else n -= 40; // wrong language entirely

  return n;
}

/**
 * The voice list is populated asynchronously. Resolve as soon as it is
 * non-empty, via `voiceschanged`, with a poll as a backstop (the event does not
 * fire at all on some platforms) and a hard timeout so we never hang a caller.
 */
function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);

  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      clearInterval(poll);
      clearTimeout(timeout);
      synth.removeEventListener("voiceschanged", finish);
    };
    const finish = () => {
      if (settled) return;
      const list = synth.getVoices();
      if (!list.length) return;
      settled = true;
      cleanup();
      resolve(list);
    };
    const poll = setInterval(finish, 100);
    const timeout = setTimeout(() => {
      settled = true;
      cleanup();
      resolve(synth.getVoices());
    }, 2000);
    synth.addEventListener("voiceschanged", finish);
  });
}

let cached: SpeechSynthesisVoice | null = null;
let cachedFrom = 0;

async function bestVoice(): Promise<SpeechSynthesisVoice | null> {
  const voices = await voicesReady();
  if (!voices.length) return null;
  // Re-pick if the list grew — network voices can register late.
  if (cached && voices.length === cachedFrom) return cached;
  const locale = navigator.language || "en-US";
  cached = voices.reduce((best, v) => (score(v, locale) > score(best, locale) ? v : best), voices[0]);
  cachedFrom = voices.length;
  return cached;
}

/**
 * Turn model output into something worth reading aloud: drop code blocks
 * entirely (nobody wants backtick-by-backtick), then strip the markdown
 * punctuation a synthesizer otherwise pronounces.
 */
export function speakable(text: string): string {
  return String(text ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split into utterances a synthesizer handles well. Chromium truncates or
 * stalls on long utterances, so break on sentence boundaries and hard-split
 * anything still oversized.
 */
export function chunk(text: string, max = 180): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) ?? [];
  const out: string[] = [];
  let buf = "";

  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length > max) {
      if (buf) {
        out.push(buf);
        buf = "";
      }
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
      continue;
    }
    if (buf.length + s.length + 1 > max) {
      out.push(buf);
      buf = s;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  if (buf) out.push(buf);
  return out;
}

// Chromium garbage-collects utterances mid-speech, which cuts audio off partway.
// Holding a reference until each one finishes is the standard workaround.
let live: SpeechSynthesisUtterance[] = [];
let keepAlive: ReturnType<typeof setInterval> | null = null;

/** Chromium also pauses the queue after ~15s; nudging it keeps long text going. */
function startKeepAlive() {
  if (keepAlive) return;
  keepAlive = setInterval(() => {
    const synth = window.speechSynthesis;
    if (!synth.speaking) {
      stopKeepAlive();
      return;
    }
    if (synth.paused) synth.resume();
  }, 5000);
}

function stopKeepAlive() {
  if (keepAlive) clearInterval(keepAlive);
  keepAlive = null;
  live = [];
}

/** Stop anything currently being spoken. */
export function stopSpeaking() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  stopKeepAlive();
}

/**
 * Say something. No-op when muted or unsupported. Cancels whatever was already
 * being said — the newest thing Otto has to say is always the relevant one.
 */
export async function speak(text: string, enabled: boolean): Promise<void> {
  if (!enabled || typeof window === "undefined" || !window.speechSynthesis) return;

  const clean = speakable(text);
  if (!clean) return;

  const synth = window.speechSynthesis;
  synth.cancel();
  stopKeepAlive();

  const voice = await bestVoice();
  const natural = Boolean(voice && (/natural|neural/i.test(voice.name) || !voice.localService));

  // Silence beats a bad voice. If the machine has nothing better than the old
  // local SAPI5 set — on a stock Windows install that is David, Mark and Zira,
  // all pre-neural — Otto says nothing rather than narrating in a robot voice
  // over someone's work. Installing the natural voices (Settings, Accessibility,
  // Narrator) turns speech back on by itself, with no setting to find.
  if (!natural) return;

  for (const part of chunk(clean)) {
    const u = new SpeechSynthesisUtterance(part);
    if (voice) u.voice = voice;
    // Neural voices are already paced well; the old SAPI5 ones read slightly
    // slow, so nudge those up. Pitch stays neutral — raising it is what makes
    // synthesized speech sound cartoonish.
    u.rate = natural ? 1.0 : 1.08;
    u.pitch = 1;
    u.volume = 1;
    u.onend = () => {
      live = live.filter((x) => x !== u);
      if (!live.length) stopKeepAlive();
    };
    live.push(u);
    synth.speak(u);
  }
  startKeepAlive();
}
