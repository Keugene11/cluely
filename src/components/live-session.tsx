"use client";

import { useEffect, useRef, useState } from "react";
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
import { useLiveSession } from "@/hooks/use-live-session";
import { AnswerBody } from "@/components/answer-body";

export function LiveSession() {
  const router = useRouter();
  const live = useLiveSession();

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("meeting");
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [live.lines, live.interim]);

  // In-page hotkey. The desktop overlay registers this globally instead.
  useEffect(() => {
    if (!live.sessionId) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void live.ask();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [live]);

  async function endSession() {
    const id = await live.end();
    if (id) router.push(`/app/s/${id}?generate=1`);
  }

  // ---- Pre-session setup ----------------------------------------------------
  if (!live.sessionId) {
    return (
      <main className="aurora grain relative mx-auto flex max-w-xl flex-col justify-center px-5 py-20">
        <h1 className="text-3xl font-semibold tracking-tight">Start a session</h1>
        <p className="mt-2 text-muted">
          Cluely listens through your microphone and answers on <kbd>Ctrl</kbd> + <kbd>Enter</kbd>.
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

          {!live.supported && (
            <p className="text-sm text-amber-400">
              This browser has no speech recognition. Chrome or Edge will transcribe; elsewhere you
              can still run the session and type your questions.
            </p>
          )}

          <button
            onClick={() => live.start(title, kind)}
            disabled={live.starting}
            className="press flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3 text-sm font-medium text-background disabled:opacity-60"
          >
            {live.starting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Radio className="h-4 w-4" />
            )}
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
      <section className="card flex h-[calc(100vh-8rem)] flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`h-2 w-2 rounded-full ${live.listening ? "live-dot bg-red-500" : "bg-muted"}`}
            />
            <span className="font-medium">{title || "Untitled session"}</span>
            <span className="text-muted">· {live.listening ? "listening" : "paused"}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => live.setSpeaker(live.speaker === "them" ? "me" : "them")}
              className="press flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs text-muted hover:text-foreground"
              title="Who is speaking right now"
            >
              {live.speaker === "me" ? (
                <User className="h-3.5 w-3.5" />
              ) : (
                <Users className="h-3.5 w-3.5" />
              )}
              {live.speaker === "me" ? "Me" : "Them"}
            </button>

            <button
              onClick={live.listening ? live.stopListening : live.startListening}
              className="press flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs hover:bg-surface-2"
            >
              {live.listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              {live.listening ? "Pause" : "Resume"}
            </button>

            <button
              onClick={endSession}
              disabled={live.ending}
              className="press flex items-center gap-2 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-60"
            >
              {live.ending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              End and write notes
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5 text-sm">
          {live.micError && <p className="text-amber-400">{live.micError}</p>}

          {live.lines.length === 0 && !live.interim && !live.micError && (
            <p className="text-muted">
              Nothing heard yet. Say something, or type a question on the right.
            </p>
          )}

          {live.lines.map((line, i) => (
            <p key={i} className="leading-relaxed">
              <span className={line.speaker === "me" ? "text-muted" : "text-foreground"}>
                {line.speaker === "me" ? "Me: " : "Them: "}
              </span>
              <span className="text-muted">{line.text}</span>
            </p>
          ))}

          {live.interim && <p className="italic text-muted/60">{live.interim}</p>}
          <div ref={transcriptEndRef} />
        </div>
      </section>

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
          {live.assists.length === 0 && (
            <div className="space-y-3 text-sm text-muted">
              <p>
                Hit <kbd>Ctrl</kbd> + <kbd>Enter</kbd> at any point and I answer whatever was just
                asked of you.
              </p>
              <p>Type a question first if you want something specific.</p>
            </div>
          )}

          {live.assists.map((assist, i) => (
            <div
              key={i}
              className="rise rounded-xl border border-line bg-surface/80 p-4 backdrop-blur"
            >
              {assist.question && (
                <p className="mb-2 text-xs uppercase tracking-widest text-muted">
                  {assist.question}
                </p>
              )}
              {assist.answer ? (
                <AnswerBody>{assist.answer}</AnswerBody>
              ) : (
                <p className="text-sm text-muted">thinking…</p>
              )}
              {!assist.done && assist.answer && (
                <span className="mt-1 inline-block h-4 w-1.5 translate-y-0.5 bg-foreground/70" />
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-line p-4">
          <div className="flex items-end gap-2">
            <textarea
              value={live.question}
              onChange={(e) => live.setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                  e.preventDefault();
                  void live.ask();
                }
              }}
              rows={2}
              placeholder="Ask something specific, or just hit Enter…"
              className="flex-1 resize-none rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm outline-none placeholder:text-muted focus:border-foreground/40"
            />
            <button
              onClick={live.ask}
              disabled={live.asking}
              className="press flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-foreground text-background disabled:opacity-60"
              aria-label="Ask"
            >
              {live.asking ? (
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
