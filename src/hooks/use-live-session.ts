"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getDesktop } from "@/lib/desktop";

export type Line = { speaker: "me" | "them"; text: string; at_ms: number };
export type Assist = { question: string; answer: string; done: boolean };

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
export function useLiveSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);

  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [speaker, setSpeaker] = useState<"me" | "them">("them");

  const [lines, setLines] = useState<Line[]>([]);
  const [interim, setInterim] = useState("");
  const [assists, setAssists] = useState<Assist[]>([]);
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
  const askingRef = useRef(false);
  const questionRef = useRef("");

  useEffect(() => void (speakerRef.current = speaker), [speaker]);
  useEffect(() => void (sessionIdRef.current = sessionId), [sessionId]);
  useEffect(() => void (linesRef.current = lines), [lines]);
  useEffect(() => void (askingRef.current = asking), [asking]);
  useEffect(() => void (questionRef.current = question), [question]);

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

  /** The Ctrl/Cmd+Enter path. Safe to call from a global hotkey. */
  const ask = useCallback(async () => {
    if (askingRef.current) return;
    askingRef.current = true;
    setAsking(true);

    const typed = questionRef.current.trim();
    setQuestion("");
    setAssists((prev) => [...prev, { question: typed, answer: "", done: false }]);

    const transcript = linesRef.current
      .slice(-60)
      .map((l) => `${l.speaker === "me" ? "Me" : "Them"}: ${l.text}`)
      .join("\n");

    // On the desktop, read the screen too so the assistant can answer about
    // whatever is in front of you — a coding problem, a slide, a spreadsheet.
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

    try {
      const res = await fetch("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current, question: typed, transcript, image }),
      });

      if (!res.body) {
        const message = await res.text().catch(() => "The assist request failed.");
        setAssists((prev) =>
          prev.map((a, i) => (i === prev.length - 1 ? { ...a, answer: message, done: true } : a)),
        );
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setAssists((prev) =>
          prev.map((a, i) => (i === prev.length - 1 ? { ...a, answer: a.answer + chunk } : a)),
        );
      }
    } finally {
      setAssists((prev) => prev.map((a, i) => (i === prev.length - 1 ? { ...a, done: true } : a)));
      askingRef.current = false;
      setAsking(false);
    }
  }, []);

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
    assists,
    question,
    setQuestion,
    asking,
    capturing,
    start,
    startListening,
    stopListening,
    ask,
    end,
  };
}
