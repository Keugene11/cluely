"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getDesktop } from "@/lib/desktop";
import { speak, stopSpeaking } from "@/lib/speech";

export type Line = { speaker: "me" | "them"; text: string; at_ms: number };

export type Point = { x: number; y: number; label: string };
export type GuideResult = { say: string; steps: string[]; point: Point | null; done: boolean };

/**
 * One turn of the conversation. There is no mode switch any more: the user
 * asks, /api/ask decides, and the kind of entry that comes back is the answer
 * to "what did they want". All three render in the same thread.
 */
export type Entry =
  | { kind: "text"; question: string; answer: string; done: boolean }
  | {
      kind: "guide";
      question: string;
      result: GuideResult;
      step: number;
      working: boolean;
      /** A real click is in flight on this step. */
      clicking: boolean;
      /** Otto is clicking its way through the remaining steps on its own. */
      auto: boolean;
      error: string | null;
      done: boolean;
    }
  | {
      kind: "act";
      question: string;
      say: string;
      target: string | null;
      label: string;
      /** "confirm" waits for a click; everything else is terminal or in flight. */
      status: "confirm" | "running" | "done" | "error" | "blocked";
      detail: string | null;
      done: boolean;
    };

/** Minimal shape of the Web Speech API we depend on. */
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

function recognitionCtor() {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function getRecognition(): SpeechRecognitionLike | null {
  const Ctor = recognitionCtor();
  return Ctor ? new Ctor() : null;
}

/** Support is fixed for the life of the page, so there is nothing to subscribe to. */
const noSubscribe = () => () => {};

/**
 * Everything a live session does: transcribe, buffer to Neon, answer on demand.
 * The web page and the desktop overlay are both thin views over this.
 */
export function useLiveSession(voiceEnabled = true) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);

  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [speaker, setSpeaker] = useState<"me" | "them">("them");

  const [lines, setLines] = useState<Line[]>([]);
  const [interim, setInterim] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const supported = useSyncExternalStore(
    noSubscribe,
    () => recognitionCtor() !== undefined,
    () => true, // assume yes on the server so the markup matches
  );

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef(false);
  const speakerRef = useRef(speaker);
  const startedAtRef = useRef(0); // set to Date.now() when a session starts
  const unsavedRef = useRef<Line[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const linesRef = useRef<Line[]>([]);
  // Mirrors `entries`. A turn needs to know the index of the row it is writing
  // to *now*, and state updaters do not run synchronously, so the ref is the
  // source of truth for indices and state is the render of it.
  const entriesRef = useRef<Entry[]>([]);
  // Indices of guide entries currently clicking through their own steps.
  const autoRef = useRef<Set<number>>(new Set());
  const askingRef = useRef(false);
  const questionRef = useRef("");
  const voiceRef = useRef(voiceEnabled);

  useEffect(() => void (speakerRef.current = speaker), [speaker]);
  useEffect(() => void (sessionIdRef.current = sessionId), [sessionId]);
  useEffect(() => void (linesRef.current = lines), [lines]);
  useEffect(() => void (askingRef.current = asking), [asking]);
  useEffect(() => void (questionRef.current = question), [question]);
  useEffect(() => void (voiceRef.current = voiceEnabled), [voiceEnabled]);

  // Muting mid-sentence should stop the sentence, not just the next one.
  useEffect(() => {
    if (!voiceEnabled) stopSpeaking();
  }, [voiceEnabled]);

  /** Push buffered transcript lines to Neon. Batched so we don't write per phrase. */
  const flush = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id || unsavedRef.current.length === 0) return;
    const batch = unsavedRef.current;
    unsavedRef.current = [];
    await fetch(`/api/sessions/${id}/transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines: batch }),
    }).catch(() => {
      unsavedRef.current = [...batch, ...unsavedRef.current];
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(flush, 5000);
    return () => clearInterval(timer);
  }, [flush]);

  const startListening = useCallback(() => {
    const recognition = getRecognition();
    if (!recognition) {
      setMicError("This browser cannot transcribe. You can still type questions.");
      return;
    }

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onresult = (event) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        if (!text) continue;

        if (result.isFinal) {
          const line: Line = {
            speaker: speakerRef.current,
            text,
            at_ms: Date.now() - startedAtRef.current,
          };
          unsavedRef.current.push(line);
          setLines((prev) => [...prev, line]);
        } else {
          pending += ` ${text}`;
        }
      }
      setInterim(pending.trim());
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setMicError("Microphone access was blocked. Allow it and start again.");
        shouldListenRef.current = false;
        setListening(false);
      } else if (event.error === "network") {
        // The Web Speech API relies on a hosted recognizer. It is reliable in
        // Chrome but not inside a packaged desktop build — say so instead of
        // silently capturing nothing.
        setMicError(
          "Live transcription is unavailable here. Type your question below, or open the web app in Chrome for automatic transcription.",
        );
        shouldListenRef.current = false;
        setListening(false);
      }
      // "no-speech" / "aborted" are transient — the onend handler restarts.
    };

    // Browsers cut the stream every ~60s; restart while the user still wants it on.
    recognition.onend = () => {
      if (shouldListenRef.current) {
        try {
          recognition.start();
        } catch {
          /* already restarting */
        }
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = recognition;
    shouldListenRef.current = true;
    setMicError(null);
    recognition.start();
    setListening(true);
  }, []);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    recognitionRef.current?.stop();
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(
    async (title: string, kind: string) => {
      setStarting(true);
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || "Untitled session", kind }),
      });
      const body = await res.json().catch(() => ({}));
      setStarting(false);
      if (!res.ok) return null;

      startedAtRef.current = Date.now();
      setSessionId(body.session.id);
      startListening();
      return body.session.id as string;
    },
    [startListening],
  );

  /** Add a row to the thread and return its index. */
  const append = useCallback((entry: Entry) => {
    const next = [...entriesRef.current, entry];
    entriesRef.current = next;
    setEntries(next);
    return next.length - 1;
  }, []);

  /** Replace the entry at `index`, leaving the rest of the thread alone. */
  const patch = useCallback((index: number, next: (e: Entry) => Entry) => {
    const current = entriesRef.current;
    if (!current[index]) return;
    const updated = current.map((e, i) => (i === index ? next(e) : e));
    entriesRef.current = updated;
    setEntries(updated);
  }, []);

  /** Hand a launch target to the desktop shell and record how it went. */
  const runOpen = useCallback(
    async (index: number, target: string, label: string) => {
      const desktop = getDesktop();
      if (!desktop?.open) {
        patch(index, (e) =>
          e.kind === "act"
            ? { ...e, status: "blocked", detail: "Launching only works in the desktop app.", done: true }
            : e,
        );
        return;
      }
      patch(index, (e) => (e.kind === "act" ? { ...e, status: "running" } : e));
      const result = await desktop.open(target).catch(() => ({ ok: false, message: "Could not open that." }));
      patch(index, (e) =>
        e.kind === "act"
          ? {
              ...e,
              status: result.ok ? "done" : "error",
              detail: result.ok ? label || result.message : result.message,
              done: true,
            }
          : e,
      );
    },
    [patch],
  );

  /**
   * The Ctrl/Cmd+Enter path, and the only path. Safe to call from a global
   * hotkey. Captures the screen, hands everything to the dispatcher, and lets
   * the response decide whether this turn is an answer, a walkthrough, or a
   * launch — the user never picks.
   */
  const ask = useCallback(async (override?: string) => {
    if (askingRef.current) return;
    askingRef.current = true;
    setAsking(true);

    // `override` is for voice: the transcript arrives in a callback, and going
    // through setQuestion first would race the state update.
    const typed = (override ?? questionRef.current).trim();
    setQuestion("");

    // The turn starts as a text answer and is rewritten in place if the
    // dispatcher calls a tool instead.
    const index = append({ kind: "text", question: typed, answer: "", done: false });

    const transcript = linesRef.current
      .slice(-60)
      .map((l) => `${l.speaker === "me" ? "Me" : "Them"}: ${l.text}`)
      .join("\n");

    // On the desktop, read the screen too so Otto can answer about whatever is
    // in front of you — a coding problem, a slide, a spreadsheet — and so the
    // dispatcher has something to point at if you wanted a walkthrough.
    let image: string | null = null;
    const desktop = getDesktop();
    if (desktop?.captureScreen) {
      setCapturing(true);
      try {
        image = await desktop.captureScreen();
      } catch {
        /* fall back to audio + text only */
      } finally {
        setCapturing(false);
      }
    }

    /**
     * Where a tool result goes. Claude can emit a sentence of text and *then*
     * call a tool; when it does, the text is worth keeping, so the tool result
     * lands in a new row instead of overwriting it.
     */
    const slotFor = (): number => {
      const at = entriesRef.current[index];
      if (at && at.kind === "text" && !at.answer) return index;
      return append({ kind: "text", question: typed, answer: "", done: false });
    };

    const onEvent = (t: string, v: unknown) => {
      if (t === "text") {
        patch(index, (e) => (e.kind === "text" ? { ...e, answer: e.answer + String(v) } : e));
        return;
      }

      if (t === "guide") {
        const result = v as GuideResult;
        const at = slotFor();
        patch(at, () => ({
          kind: "guide",
          question: typed,
          result,
          step: 0,
          working: false,
          clicking: false,
          auto: false,
          error: null,
          done: result.done,
        }));
        void speak(result.say, voiceRef.current);
        if (result.point) void desktop?.point(result.point);
        else void desktop?.clearPoint();
        return;
      }

      if (t === "open") {
        const action = v as { say: string; target: string | null; label: string; explicit: boolean };
        const at = slotFor();
        // No target means the model wanted to launch something we rejected;
        // there is nothing to confirm, only something to say.
        const status = !action.target ? "blocked" : action.explicit ? "running" : "confirm";
        patch(at, () => ({
          kind: "act",
          question: typed,
          say: action.say,
          target: action.target,
          label: action.label,
          status,
          detail: null,
          done: status === "blocked",
        }));
        void speak(action.say, voiceRef.current);
        // Only launch unprompted when the user actually commanded it. Anything
        // Otto merely inferred waits for a click — a wrong guess here starts a
        // process on someone's computer, which is not an undoable mistake.
        if (action.target && action.explicit) void runOpen(at, action.target, action.label);
        return;
      }

      if (t === "error") {
        patch(index, (e) =>
          e.kind === "text" ? { ...e, answer: e.answer + `\n\n${String(v)}`, done: true } : e,
        );
      }
    };

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current, question: typed, transcript, image }),
      });

      if (!res.body) {
        const message = await res.text().catch(() => "The request failed.");
        patch(index, (e) => (e.kind === "text" ? { ...e, answer: message, done: true } : e));
        return;
      }

      // Newline-delimited JSON: a chunk can split a line, so buffer the tail.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const { t, v } = JSON.parse(line) as { t: string; v: unknown };
            onEvent(t, v);
          } catch {
            /* a malformed frame is not worth failing the whole turn over */
          }
        }
      }
      if (buffer.trim()) {
        try {
          const { t, v } = JSON.parse(buffer) as { t: string; v: unknown };
          onEvent(t, v);
        } catch {
          /* ignore a truncated trailing frame */
        }
      }
    } catch {
      patch(index, (e) =>
        e.kind === "text" ? { ...e, answer: "Otto couldn't reach the server.", done: true } : e,
      );
    } finally {
      patch(index, (e) => (e.kind === "text" ? { ...e, done: true } : e));
      askingRef.current = false;
      setAsking(false);
    }
  }, [append, patch, runOpen]);

  /**
   * Advance a walkthrough: the screen has changed since the last step, so take a
   * fresh shot and ask where to point now. This stays on /api/guide rather than
   * the dispatcher — mid-walkthrough there is nothing left to decide.
   */
  const advanceGuide = useCallback(
    async (index: number) => {
      const entry = entriesRef.current[index];
      if (!entry || entry.kind !== "guide" || entry.working) return;

      const desktop = getDesktop();
      if (!desktop?.captureScreen) {
        patch(index, (e) =>
          e.kind === "guide" ? { ...e, error: "Guiding needs the desktop app." } : e,
        );
        return;
      }

      const nextStep = entry.step + 1;
      patch(index, (e) => (e.kind === "guide" ? { ...e, working: true, error: null } : e));

      const image = await desktop.captureScreen().catch(() => null);
      if (!image) {
        patch(index, (e) =>
          e.kind === "guide" ? { ...e, working: false, error: "Couldn't capture your screen." } : e,
        );
        return;
      }

      const res = await fetch("/api/guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: entry.question,
          steps: entry.result.steps,
          stepIndex: nextStep,
          image,
        }),
      }).catch(() => null);

      if (!res || !res.ok) {
        const body = await res?.json().catch(() => ({}));
        patch(index, (e) =>
          e.kind === "guide"
            ? { ...e, working: false, error: body?.error ?? "The guide failed." }
            : e,
        );
        return;
      }

      const { result } = (await res.json()) as { result: GuideResult };
      patch(index, (e) =>
        e.kind === "guide"
          ? { ...e, result, step: nextStep, working: false, error: null, done: result.done }
          : e,
      );
      void speak(result.say, voiceRef.current);
      if (result.point) void desktop.point(result.point);
      else void desktop.clearPoint();
    },
    [patch],
  );

  /**
   * Press the element the cursor is pointing at, for real, then move on to the
   * next step. The screenshot the next step is read from has to come AFTER the
   * app has repainted, hence the settle delay — read too early and Otto points
   * at the menu it just dismissed.
   *
   * Returns whether there is another step worth clicking, which is what lets
   * runRest chain them.
   */
  const clickStep = useCallback(
    async (index: number): Promise<boolean> => {
      const entry = entriesRef.current[index];
      if (!entry || entry.kind !== "guide" || entry.working || entry.clicking) return false;

      const fail = (message: string) => {
        patch(index, (e) => (e.kind === "guide" ? { ...e, clicking: false, error: message } : e));
        return false;
      };

      const point = entry.result.point;
      if (!point) return fail("There is nothing to click on this step — do it yourself and hit Next.");

      const desktop = getDesktop();
      if (!desktop?.click) return fail("Clicking only works in the desktop app.");

      patch(index, (e) => (e.kind === "guide" ? { ...e, clicking: true, error: null } : e));
      const result = await desktop
        .click(point)
        .catch(() => ({ ok: false, message: "Could not click that." }));
      patch(index, (e) => (e.kind === "guide" ? { ...e, clicking: false } : e));
      if (!result.ok) return fail(result.message);

      await new Promise((r) => setTimeout(r, 750)); // let the app repaint
      const settled = entriesRef.current[index];
      if (settled?.kind === "guide" && settled.done) return false;

      await advanceGuide(index);
      const after = entriesRef.current[index];
      return after?.kind === "guide" && !after.done && !after.error && after.result.point != null;
    },
    [patch, advanceGuide],
  );

  /**
   * "Do the rest" — click through the remaining steps without being asked each
   * time. Bounded and stoppable on purpose: this drives the real mouse on
   * someone's real desktop, so it never runs unattended forever, and Stop takes
   * effect between steps rather than after the whole plan.
   */
  const runRest = useCallback(
    async (index: number) => {
      if (autoRef.current.has(index)) return;
      autoRef.current.add(index);
      patch(index, (e) => (e.kind === "guide" ? { ...e, auto: true } : e));
      try {
        for (let i = 0; i < 12; i++) {
          if (!autoRef.current.has(index)) break;
          if (!(await clickStep(index))) break;
        }
      } finally {
        autoRef.current.delete(index);
        patch(index, (e) => (e.kind === "guide" ? { ...e, auto: false } : e));
      }
    },
    [clickStep, patch],
  );

  /** The user clicked through a launch Otto inferred rather than was told to do. */
  const confirmOpen = useCallback(
    (index: number) => {
      const entry = entriesRef.current[index];
      if (!entry || entry.kind !== "act" || entry.status !== "confirm" || !entry.target) return;
      void runOpen(index, entry.target, entry.label);
    },
    [runOpen],
  );

  /** Dismiss a walkthrough or a launch the user does not want. */
  const dismiss = useCallback(
    (index: number) => {
      stopSpeaking();
      autoRef.current.delete(index); // halts runRest between steps
      getDesktop()?.clearPoint();
      patch(index, (e) => {
        if (e.kind === "guide") return { ...e, done: true };
        if (e.kind === "act" && e.status === "confirm") {
          return { ...e, status: "blocked", detail: "Cancelled.", done: true };
        }
        return e;
      });
    },
    [patch],
  );

  const end = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) return null;
    setEnding(true);
    stopListening();
    await flush();
    await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ended" }),
    });
    setEnding(false);
    return id;
  }, [flush, stopListening]);

  return {
    sessionId,
    starting,
    ending,
    listening,
    supported,
    micError,
    speaker,
    setSpeaker,
    lines,
    interim,
    entries,
    question,
    setQuestion,
    asking,
    capturing,
    start,
    startListening,
    stopListening,
    ask,
    advanceGuide,
    clickStep,
    runRest,
    confirmOpen,
    dismiss,
    end,
  };
}
