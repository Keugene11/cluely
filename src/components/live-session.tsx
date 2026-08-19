"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  CornerDownLeft,
  Loader2,
  Mic,
  MicOff,
  Radio,
  Sparkles,
  Square,
  User,
  Users,
} from "lucide-react";

type Line = { speaker: "me" | "them"; text: string; at_ms: number };
type Assist = { question: string; answer: string; done: boolean };

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

export function LiveSession() {
  const router = useRouter();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("meeting");
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);

  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const supported = useSyncExternalStore(
    noSubscribe,
    () => recognitionCtor() !== undefined,
    () => true, // assume yes on the server so the markup matches
  );
  const [speaker, setSpeaker] = useState<"me" | "them">("them");

  const [lines, setLines] = useState<Line[]>([]);
  const [interim, setInterim] = useState("");
  const [assists, setAssists] = useState<Assist[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef(false);
  const speakerRef = useRef(speaker);
  const startedAtRef = useRef(Date.now());
  const unsavedRef = useRef<Line[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const linesRef = useRef<Line[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => void (speakerRef.current = speaker), [speaker]);
  useEffect(() => void (sessionIdRef.current = sessionId), [sessionId]);
  useEffect(() => void (linesRef.current = lines), [lines]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, interim]);

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
        setMicError("Microphone access was blocked. Allow it in your browser and start again.");
        shouldListenRef.current = false;
        setListening(false);
      }
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

  async function startSession() {
    setStarting(true);
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() || "Untitled session", kind }),
    });
    const body = await res.json();
    setStarting(false);
    if (!res.ok) return;

    startedAtRef.current = Date.now();
    setSessionId(body.session.id);
    startListening();
  }

  const ask = useCallback(async () => {
    if (asking) return;
    setAsking(true);

    const typed = question.trim();
    setQuestion("");
    setAssists((prev) => [...prev, { question: typed, answer: "", done: false }]);

    const transcript = linesRef.current
      .slice(-60)
      .map((l) => `${l.speaker === "me" ? "Me" : "Them"}: ${l.text}`)
      .join("\n");

    const res = await fetch("/api/assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sessionIdRef.current, question: typed, transcript }),
    });

    if (!res.body) {
      setAssists((prev) =>
        prev.map((a, i) =>
          i === prev.length - 1 ? { ...a, answer: "The assist request failed.", done: true } : a,
        ),
      );
      setAsking(false);
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

    setAssists((prev) => prev.map((a, i) => (i === prev.length - 1 ? { ...a, done: true } : a)));
    setAsking(false);
  }, [asking, question]);

  /** The hotkey. Works anywhere on the page, including from the question box. */
  useEffect(() => {
    if (!sessionId) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void ask();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sessionId, ask]);

  async function endSession() {
    if (!sessionId) return;
    setEnding(true);
    stopListening();
    await flush();
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ended" }),
    });
    router.push(`/app/s/${sessionId}?generate=1`);
  }

  // ---- Pre-session setup ----------------------------------------------------
  if (!sessionId) {
    return (
      <main className="aurora grain relative mx-auto flex max-w-xl flex-col justify-center px-5 py-20">
        <h1 className="text-3xl font-semibold tracking-tight">Start a session</h1>
        <p className="mt-2 text-muted">
          Cluely listens through your microphone and answers on <kbd>Ctrl</kbd> +{" "}
          <kbd>Enter</kbd>.
        </p>

        <div className="card mt-8 space-y-4 p-6">
          <div>
            <label className="text-sm text-muted">What is this call?</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Pricing call with Northwind"
              className="mt-2 w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm outline-none placeholder:text-muted focus:border-foreground/40"
            />
          </div>

          <div>
            <label className="text-sm text-muted">Type</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {["meeting", "sales", "interview", "study"].map((option) => (
                <button
                  key={option}
                  onClick={() => setKind(option)}
                  className={`press rounded-full border px-4 py-2 text-sm capitalize ${
                    kind === option
                      ? "border-foreground bg-foreground text-background"
                      : "border-line text-muted hover:text-foreground"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {!supported && (
            <p className="text-sm text-amber-400">
              This browser has no speech recognition. Chrome or Edge will transcribe; elsewhere you
              can still run the session and type your questions.
            </p>
          )}

          <button
            onClick={startSession}
            disabled={starting}
            className="press flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3 text-sm font-medium text-background disabled:opacity-60"
          >
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
            Start listening
          </button>

          <p className="text-center text-xs text-muted">
            Tell the people you are talking to that it is running.
          </p>
        </div>
      </main>
    );
  }

  // ---- Live ----------------------------------------------------------------
  return (
    <main className="mx-auto grid max-w-6xl gap-5 px-5 py-8 lg:grid-cols-[1fr_420px]">
      {/* Transcript */}
      <section className="card flex h-[calc(100vh-8rem)] flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`h-2 w-2 rounded-full ${listening ? "live-dot bg-red-500" : "bg-muted"}`}
            />
            <span className="font-medium">{title || "Untitled session"}</span>
            <span className="text-muted">· {listening ? "listening" : "paused"}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSpeaker(speaker === "them" ? "me" : "them")}
              className="press flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs text-muted hover:text-foreground"
              title="Who is speaking right now"
            >
              {speaker === "me" ? <User className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
              {speaker === "me" ? "Me" : "Them"}
            </button>

            <button
              onClick={listening ? stopListening : startListening}
              className="press flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs hover:bg-surface-2"
            >
              {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              {listening ? "Pause" : "Resume"}
            </button>

            <button
              onClick={endSession}
              disabled={ending}
              className="press flex items-center gap-2 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-60"
            >
              {ending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
              End and write notes
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5 text-sm">
          {micError && <p className="text-amber-400">{micError}</p>}

          {lines.length === 0 && !interim && !micError && (
            <p className="text-muted">
              Nothing heard yet. Say something, or type a question on the right.
            </p>
          )}

          {lines.map((line, i) => (
            <p key={i} className="leading-relaxed">
              <span className={line.speaker === "me" ? "text-muted" : "text-foreground"}>
                {line.speaker === "me" ? "Me: " : "Them: "}
              </span>
              <span className="text-muted">{line.text}</span>
            </p>
          ))}

          {interim && <p className="italic text-muted/60">{interim}</p>}
          <div ref={transcriptEndRef} />
        </div>
      </section>

      {/* The overlay */}
      <section className="card aurora relative flex h-[calc(100vh-8rem)] flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4" /> Cluely
          </span>
          <span className="text-xs text-muted">
            <kbd>Ctrl</kbd> + <kbd>Enter</kbd>
          </span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {assists.length === 0 && (
            <div className="space-y-3 text-sm text-muted">
              <p>
                Hit <kbd>Ctrl</kbd> + <kbd>Enter</kbd> at any point and I answer whatever was just
                asked of you.
              </p>
              <p>Type a question first if you want something specific.</p>
            </div>
          )}

          {assists.map((assist, i) => (
            <div key={i} className="rise rounded-xl border border-line bg-surface/80 p-4 backdrop-blur">
              {assist.question && (
                <p className="mb-2 text-xs uppercase tracking-widest text-muted">
                  {assist.question}
                </p>
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {assist.answer || <span className="text-muted">thinking…</span>}
                {!assist.done && assist.answer && (
                  <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 bg-foreground/70" />
                )}
              </p>
            </div>
          ))}
        </div>

        <div className="border-t border-line p-4">
          <div className="flex items-end gap-2">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={2}
              placeholder="Optional: ask something specific…"
              className="flex-1 resize-none rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm outline-none placeholder:text-muted focus:border-foreground/40"
            />
            <button
              onClick={ask}
              disabled={asking}
              className="press flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-foreground text-background disabled:opacity-60"
              aria-label="Ask"
            >
              {asking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CornerDownLeft className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
