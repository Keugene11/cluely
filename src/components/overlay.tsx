"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Mic,
  MicOff,
  MousePointerClick,
  Rocket,
  ScanEye,
  Sparkles,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from "lucide-react";
import { useLiveSession, type Entry } from "@/hooks/use-live-session";
import { useVoice } from "@/hooks/use-voice";
import { loadVoicePref, saveVoicePref, stopSpeaking } from "@/lib/speech";
import { getDesktop, type DesktopBridge, type UpdateState } from "@/lib/desktop";
import { AnswerBody } from "@/components/answer-body";

const drag = { WebkitAppRegion: "drag" } as React.CSSProperties;
const noDrag = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

export function Overlay() {
  const [desktop, setDesktop] = useState<DesktopBridge | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [open, setOpen] = useState(true); // show the panel + instructions on launch
  const live = useLiveSession(voiceOn);
  const voice = useVoice();

  const [hidden, setHidden] = useState(false);
  const [update, setUpdate] = useState<UpdateState | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);

  // The mute preference outlives the session — being talked at when you asked
  // for quiet, every time you reopen the app, is the whole complaint.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVoiceOn(loadVoicePref());
  }, []);

  const toggleVoice = useCallback(() => {
    setVoiceOn((v) => {
      const next = !v;
      saveVoicePref(next);
      if (!next) stopSpeaking(); // silence what is being said right now, too
      return next;
    });
  }, []);

  // `live.ask` is stable; wrapping it here only adds "and open the panel".
  const liveAsk = live.ask;
  const ask = useCallback(
    (text?: string) => {
      setOpen(true);
      void liveAsk(text);
    },
    [liveAsk],
  );

  // `voice.toggle` changes identity on every recording state change. The bridge
  // effect must not re-subscribe when it does: re-running it re-fetches the
  // update state, which sets state, which renders, which would re-run it again.
  const voiceRef = useRef(voice);
  useEffect(() => void (voiceRef.current = voice), [voice]);
  const askRef = useRef(ask);
  useEffect(() => void (askRef.current = ask), [ask]);

  // Bridge wiring. Subscribes once, on mount.
  useEffect(() => {
    const bridge = getDesktop();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDesktop(bridge);
    if (!bridge) return;
    void bridge.getState().then((s) => setHidden(s.contentProtection));
    void bridge.getUpdateState().then(setUpdate);
    const offState = bridge.onState((s) => setHidden(s.contentProtection));
    const offUpdate = bridge.onUpdate(setUpdate);
    // The push-to-talk hotkey: record, then send whatever was heard. What to do
    // with it is the dispatcher's problem, not a mode the user has to pre-pick.
    const offVoice = bridge.onVoiceGuide(() => {
      setOpen(true);
      voiceRef.current.toggle((t) => askRef.current(t));
    });
    return () => {
      offState();
      offUpdate();
      offVoice();
    };
  }, []);

  // Auto-resize the window to hug the content (Otto's bar-that-expands).
  useEffect(() => {
    const el = rootRef.current;
    const bridge = getDesktop();
    if (!el || !bridge?.resize) return;
    let raf = 0;
    let sent = -1;
    const report = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // Each call is an IPC hop plus a setBounds on a transparent,
        // always-on-top window — expensive enough that firing it for a height
        // we already asked for is worth avoiding. A streaming answer trips the
        // observer constantly while the height sits still.
        const height = el.offsetHeight;
        if (height === sent) return;
        sent = height;
        bridge.resize(height);
      });
    };
    const ro = new ResizeObserver(report);
    ro.observe(el);
    report();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  // No auto-listening: the desktop overlay answers from your screen + your
  // question (typed or spoken via the mic). Continuous browser transcription is
  // unreliable in Electron, so we don't start it — that's what produced the
  // confusing "transcription unavailable" error on launch.

  // Global hotkey (Ctrl+Enter).
  useEffect(() => {
    if (!desktop) return;
    return desktop.onAssist(() => ask());
  }, [desktop, ask]);

  const panelOpen =
    open || live.entries.length > 0 || live.capturing || live.micError != null;

  return (
    <div ref={rootRef} className="w-full px-3 pt-3 pb-3" style={{ background: "transparent" }}>
      {/* The bar */}
      <div className="cbar" style={drag}>
        <div className="flex items-center gap-2.5 pl-1" style={noDrag}>
          <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-gradient-to-br from-indigo-400/30 to-fuchsia-400/20 ring-1 ring-white/10">
            <Sparkles className="h-4 w-4" />
          </span>
          {live.sessionId && (
            <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
              <span
                className={`h-1.5 w-1.5 rounded-full ${live.listening ? "live-dot bg-red-500" : "bg-muted"}`}
              />
              {live.listening ? "listening" : "paused"}
            </span>
          )}
        </div>

        <p className="hidden flex-1 px-3 text-center text-xs text-muted sm:block">
          Ask, or say what you want done
        </p>

        {/* Actions */}
        <div className="flex items-center gap-1" style={noDrag}>
          <button onClick={() => ask()} className="cbtn-primary">
            <span className="hidden sm:inline">Ask</span>
            <kbd className="kbd-mini">⌘↵</kbd>
          </button>

          <div className="mx-0.5 h-5 w-px bg-white/10" />

          <IconBtn
            active={voiceOn}
            onClick={toggleVoice}
            title={voiceOn ? "Speaking out loud — click to mute" : "Muted — click to unmute"}
          >
            {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </IconBtn>

          {desktop && (
            <IconBtn
              active={hidden}
              onClick={async () => setHidden(await desktop.setContentProtection(!hidden))}
              title={hidden ? "Hidden from screen recording" : "Visible in screen recording"}
            >
              {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </IconBtn>
          )}

          <IconBtn onClick={() => desktop?.quit()} title="Quit">
            <X className="h-4 w-4" />
          </IconBtn>
        </div>
      </div>

      {/* Update banner */}
      {update?.status === "ready" && (
        <div className="cpanel mt-2 flex items-center justify-between px-4 py-2 text-xs" style={noDrag}>
          <span className="flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5" /> Update {update.version} ready
          </span>
          <button onClick={() => desktop?.installUpdate()} className="cbtn-primary">
            Restart
          </button>
        </div>
      )}

      {/* The expanding panel */}
      {panelOpen && (
        <div className="cpanel rise mt-2 overflow-hidden" style={noDrag}>
          <Thread live={live} voice={voice} onAsk={ask} />
        </div>
      )}
    </div>
  );
}

// ── The one thread ───────────────────────────────────────────────────────────

function Thread({
  live,
  voice,
  onAsk,
}: {
  live: ReturnType<typeof useLiveSession>;
  voice: ReturnType<typeof useVoice>;
  onAsk: (text?: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [live.entries, live.capturing]);

  return (
    <>
      <div className="max-h-[460px] space-y-2.5 overflow-y-auto px-4 py-3.5">
        {live.entries.length === 0 && !live.capturing && (
          <div className="px-2 py-5 text-center">
            <p className="text-sm text-foreground">Ask me anything — I can see your screen.</p>
            <p className="mt-1.5 text-xs text-muted">
              Answers, step-by-step walkthroughs, or opening an app. Just say which.
            </p>
          </div>
        )}

        {/* The handlers are passed by identity, not as fresh closures, so a
            memoized card only re-renders when its own entry changes. During a
            streaming answer that is one card instead of the whole thread. */}
        {live.entries.map((entry, i) => (
          <EntryCard
            key={i}
            index={i}
            entry={entry}
            onNext={live.advanceGuide}
            onClickStep={live.clickStep}
            onRunRest={live.runRest}
            onConfirm={live.confirmOpen}
            onDismiss={live.dismiss}
          />
        ))}

        {live.capturing && (
          <div className="reading-chip">
            <ScanEye className="h-3.5 w-3.5" /> Reading your screen…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {live.micError && <p className="notice mx-4 mb-2">{live.micError}</p>}
      {voice.error && <p className="notice mx-4 mb-2">{voice.error}</p>}
      <InputRow
        value={live.question}
        onChange={live.setQuestion}
        onSubmit={() => onAsk()}
        busy={live.asking}
        placeholder="Ask, or tell me what to do…"
        mic={{
          recording: voice.recording,
          busy: voice.busy,
          toggle: () => voice.toggle((t) => onAsk(t)),
        }}
      />
    </>
  );
}

/**
 * What the user said, as its own turn in the thread.
 *
 * This used to be an 11px uppercase caption inside the reply — and on a
 * walkthrough it was not rendered at all, so asking for something made your own
 * words disappear. A conversation shows both halves: you see what you said, then
 * the answer arrives underneath it.
 */
function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-2xl rounded-br-md bg-white/10 px-3.5 py-2 text-[13px] leading-relaxed text-foreground">
        {text}
      </p>
    </div>
  );
}

const EntryCard = memo(function EntryCard(props: {
  index: number;
  entry: Entry;
  onNext: (i: number) => void;
  onClickStep: (i: number) => void;
  onRunRest: (i: number) => void;
  onConfirm: (i: number) => void;
  onDismiss: (i: number) => void;
}) {
  return (
    <>
      {props.entry.question && <UserMessage text={props.entry.question} />}
      <EntryBody {...props} />
    </>
  );
});

function EntryBody({
  index,
  entry,
  onNext: next,
  onClickStep: clickStep,
  onRunRest: runRest,
  onConfirm: confirm,
  onDismiss: dismiss,
}: {
  index: number;
  entry: Entry;
  onNext: (i: number) => void;
  onClickStep: (i: number) => void;
  onRunRest: (i: number) => void;
  onConfirm: (i: number) => void;
  onDismiss: (i: number) => void;
}) {
  const onNext = () => next(index);
  const onClickStep = () => clickStep(index);
  const onRunRest = () => runRest(index);
  const onConfirm = () => confirm(index);
  const onDismiss = () => dismiss(index);

  if (entry.kind === "text") {
    return (
      <div className="answer-card p-3.5">
        {entry.answer ? (
          <AnswerBody>{entry.answer}</AnswerBody>
        ) : (
          <p className="text-[13px] text-muted">thinking…</p>
        )}
        {!entry.done && entry.answer && <span className="typing-caret" />}
      </div>
    );
  }

  if (entry.kind === "guide") {
    const { result, step } = entry;
    const busy = entry.working || entry.clicking;
    return (
      <div className="answer-card space-y-3 p-3.5">
        {result.steps.length > 0 && !entry.done && (
          <p className="text-[11px] font-medium uppercase tracking-widest text-indigo-300">
            Step {Math.min(step + 1, result.steps.length)} of {result.steps.length}
          </p>
        )}

        <p className="text-[13px] leading-relaxed">{result.say}</p>

        {result.point && !entry.done && (
          <p className="flex items-center gap-1.5 text-xs text-indigo-300">
            <MousePointerClick className="h-3.5 w-3.5" />
            {entry.clicking ? "Clicking" : "Pointing at"}{" "}
            <span className="text-foreground">{result.point.label}</span>
          </p>
        )}

        {result.steps.length > 0 && (
          <ol className="space-y-1.5 text-[13px]">
            {result.steps.map((s, i) => {
              const state = i < step ? "past" : i === step ? "now" : "future";
              return (
                <li key={i} className="flex gap-2.5 leading-relaxed">
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                      state === "now"
                        ? "bg-indigo-400 text-black"
                        : state === "past"
                          ? "bg-emerald-400/20 text-emerald-200"
                          : "bg-white/10 text-muted"
                    }`}
                  >
                    {state === "past" ? "✓" : i + 1}
                  </span>
                  <span className={state === "future" ? "text-muted" : ""}>{s}</span>
                </li>
              );
            })}
          </ol>
        )}

        {entry.error && <p className="notice">{entry.error}</p>}

        {entry.done ? (
          <span className="flex items-center gap-1.5 text-xs text-emerald-300">
            <Wand2 className="h-3.5 w-3.5" /> That&rsquo;s the whole thing.
          </span>
        ) : entry.auto ? (
          // Otto is driving. The only control that matters now is the brake.
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-indigo-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Working through the steps…
            </span>
            <button onClick={onDismiss} className="cbtn-ghost">
              Stop
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <button onClick={onDismiss} className="text-xs text-muted hover:text-foreground">
              Stop
            </button>
            <div className="flex shrink-0 items-center gap-1.5">
              {/* Handing the mouse over is opt-in every time: one step with
                  "Click it", or the whole remaining plan with "Do the rest". */}
              {result.point && step < result.steps.length - 1 && (
                <button onClick={onRunRest} disabled={busy} className="cbtn-ghost">
                  Do the rest
                </button>
              )}
              {result.steps.length > 1 && (
                <button onClick={onNext} disabled={busy} className="cbtn-ghost">
                  {entry.working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Next →"}
                </button>
              )}
              {result.point && (
                <button onClick={onClickStep} disabled={busy} className="cbtn-primary">
                  {entry.clicking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <MousePointerClick className="h-3.5 w-3.5" /> Click it
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // A launch.
  return (
    <div className="answer-card p-3.5">
      {entry.say && <p className="text-[13px] leading-relaxed">{entry.say}</p>}

      {entry.status === "confirm" && (
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted" title={entry.target ?? ""}>
            {entry.target}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <button onClick={onDismiss} className="text-xs text-muted hover:text-foreground">
              No
            </button>
            <button onClick={onConfirm} className="cbtn-primary">
              <Rocket className="h-3.5 w-3.5" />
              Open {entry.label || "it"}
            </button>
          </div>
        </div>
      )}

      {entry.status === "running" && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Opening…
        </p>
      )}
      {entry.status === "done" && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-300">
          <Wand2 className="h-3.5 w-3.5" /> {entry.detail}
        </p>
      )}
      {(entry.status === "error" || entry.status === "blocked") && entry.detail && (
        <p className="mt-1.5 text-xs text-amber-300/90">{entry.detail}</p>
      )}
    </div>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────

function InputRow({
  value,
  onChange,
  onSubmit,
  busy,
  placeholder,
  mic,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  placeholder: string;
  mic?: { recording: boolean; busy: boolean; toggle: () => void };
}) {
  return (
    <div className="flex items-end gap-2 border-t border-white/8 p-2.5">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        rows={1}
        placeholder={mic?.recording ? "Listening…" : mic?.busy ? "Transcribing…" : placeholder}
        className="flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-white/20"
      />
      {mic && (
        <button
          onClick={mic.toggle}
          disabled={mic.busy}
          className={`press flex h-[40px] w-[40px] items-center justify-center rounded-xl border ${
            mic.recording
              ? "border-red-500/50 bg-red-500/15 text-red-300"
              : "border-white/10 bg-white/[0.04] text-muted hover:text-foreground"
          }`}
          title="Ask by voice"
        >
          {mic.busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : mic.recording ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </button>
      )}
      <button
        onClick={onSubmit}
        disabled={busy}
        className="press flex h-[40px] w-[40px] items-center justify-center rounded-xl bg-white text-black disabled:opacity-60"
        aria-label="Send"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
      </button>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`press flex h-8 w-8 items-center justify-center rounded-lg ${
        active ? "bg-white/12 text-foreground" : "text-muted hover:bg-white/8 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
