"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Compass,
  Download,
  Eye,
  EyeOff,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  MousePointerClick,
  ScanEye,
  Sparkles,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from "lucide-react";
import { useLiveSession } from "@/hooks/use-live-session";
import { useGuide } from "@/hooks/use-guide";
import { useAct } from "@/hooks/use-act";
import { useVoice } from "@/hooks/use-voice";
import { getDesktop, type DesktopBridge, type UpdateState } from "@/lib/desktop";
import { AnswerBody } from "@/components/answer-body";

const drag = { WebkitAppRegion: "drag" } as React.CSSProperties;
const noDrag = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

type Mode = "assist" | "guide" | "act";

export function Overlay() {
  const live = useLiveSession();
  const [desktop, setDesktop] = useState<DesktopBridge | null>(null);
  const [mode, setMode] = useState<Mode>("assist");
  const [voiceOn, setVoiceOn] = useState(true);
  const [open, setOpen] = useState(true); // show the panel + instructions on launch
  const guide = useGuide(voiceOn);
  const act = useAct(voiceOn);
  const voice = useVoice();

  const [hidden, setHidden] = useState(false);
  const [update, setUpdate] = useState<UpdateState | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);

  // Bridge wiring.
  useEffect(() => {
    const bridge = getDesktop();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDesktop(bridge);
    if (!bridge) return;
    void bridge.getState().then((s) => setHidden(s.contentProtection));
    void bridge.getUpdateState().then(setUpdate);
    const offState = bridge.onState((s) => setHidden(s.contentProtection));
    const offUpdate = bridge.onUpdate(setUpdate);
    const offVoice = bridge.onVoiceGuide(() => {
      setMode("guide");
      setOpen(true);
      voice.toggle((t) => guide.guide(t));
    });
    return () => {
      offState();
      offUpdate();
      offVoice();
    };
  }, [guide, voice]);

  // Auto-resize the window to hug the content (Otto's bar-that-expands).
  useEffect(() => {
    const el = rootRef.current;
    const bridge = getDesktop();
    if (!el || !bridge?.resize) return;
    let raf = 0;
    const report = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => bridge.resize(el.offsetHeight));
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

  // Global hotkey (Ctrl+Enter) → assist, and open the panel.
  useEffect(() => {
    if (!desktop) return;
    return desktop.onAssist(() => {
      setMode("assist");
      setOpen(true);
      void live.ask();
    });
  }, [desktop, live]);

  const askAssist = useCallback(() => {
    setOpen(true);
    void live.ask();
  }, [live]);

  const hasContent =
    (mode === "assist" && (live.assists.length > 0 || live.capturing || live.micError)) ||
    (mode === "guide" && (guide.result != null || guide.working || guide.error != null)) ||
    (mode === "act" && act.log.length > 0);

  const panelOpen = open || hasContent;

  return (
    <div ref={rootRef} className="w-full px-3 pt-3 pb-3" style={{ background: "transparent" }}>
      {/* The bar */}
      <div className="cbar" style={drag}>
        <div className="flex items-center gap-2.5 pl-1" style={noDrag}>
          <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-gradient-to-br from-indigo-400/30 to-fuchsia-400/20 ring-1 ring-white/10">
            <Sparkles className="h-4 w-4" />
          </span>
          {mode === "assist" && live.sessionId && (
            <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
              <span className={`h-1.5 w-1.5 rounded-full ${live.listening ? "live-dot bg-red-500" : "bg-muted"}`} />
              {live.listening ? "listening" : "paused"}
            </span>
          )}
        </div>

        {/* Mode segmented control */}
        <div className="flex items-center gap-0.5 rounded-full bg-white/5 p-0.5" style={noDrag}>
          <Seg active={mode === "assist"} onClick={() => setMode("assist")} icon={MessageSquare}>
            Assist
          </Seg>
          <Seg active={mode === "guide"} onClick={() => setMode("guide")} icon={Compass}>
            Guide
          </Seg>
          <Seg active={mode === "act"} onClick={() => setMode("act")} icon={Wand2}>
            Act
          </Seg>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1" style={noDrag}>
          {mode === "assist" && (
            <button onClick={askAssist} className="cbtn-primary">
              <span className="hidden sm:inline">Ask</span>
              <kbd className="kbd-mini">⌘↵</kbd>
            </button>
          )}
          {mode === "guide" && (
            <button onClick={() => setOpen(true)} className="cbtn-primary">
              <Compass className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Guide me</span>
            </button>
          )}
          {mode === "act" && (
            <button onClick={() => setOpen(true)} className="cbtn-primary">
              <Wand2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Command</span>
            </button>
          )}

          <div className="mx-0.5 h-5 w-px bg-white/10" />

          <IconBtn active={voiceOn} onClick={() => setVoiceOn((v) => !v)} title={voiceOn ? "Voice on" : "Muted"}>
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
          {mode === "assist" && <AssistPanel live={live} onAsk={askAssist} voice={voice} />}
          {mode === "guide" && <GuidePanel guide={guide} voice={voice} hasDesktop={Boolean(desktop)} />}
          {mode === "act" && <ActPanel act={act} voice={voice} hasDesktop={Boolean(desktop)} />}
        </div>
      )}
    </div>
  );
}

// ── Assist panel ─────────────────────────────────────────────────────────────

function AssistPanel({
  live,
  onAsk,
  voice,
}: {
  live: ReturnType<typeof useLiveSession>;
  onAsk: () => void;
  voice: ReturnType<typeof useVoice>;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [live.assists, live.capturing]);

  return (
    <>
      <div className="max-h-[460px] space-y-2.5 overflow-y-auto px-4 py-3.5">
        {live.assists.length === 0 && !live.capturing && (
          <div className="px-2 py-5 text-center">
            <p className="text-sm text-foreground">Ask me anything — I can see your screen.</p>
            <p className="mt-1.5 text-xs text-muted">
              Type below and press Enter, or tap the mic to talk.
            </p>
          </div>
        )}

        {live.assists.map((a, i) => (
          <div key={i} className="answer-card p-3.5">
            {a.question && (
              <p className="mb-1.5 text-[11px] uppercase tracking-widest text-muted">{a.question}</p>
            )}
            {a.answer ? <AnswerBody>{a.answer}</AnswerBody> : <p className="text-[13px] text-muted">thinking…</p>}
            {!a.done && a.answer && <span className="typing-caret" />}
          </div>
        ))}

        {live.capturing && (
          <div className="reading-chip">
            <ScanEye className="h-3.5 w-3.5" /> Reading your screen…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {voice.error && <p className="notice mx-4 mb-2">{voice.error}</p>}
      <InputRow
        value={live.question}
        onChange={live.setQuestion}
        onSubmit={onAsk}
        busy={live.asking}
        placeholder="Ask anything…"
        mic={{
          recording: voice.recording,
          busy: voice.busy,
          toggle: () => voice.toggle((t) => live.setQuestion(t)),
        }}
      />
    </>
  );
}

// ── Guide panel ──────────────────────────────────────────────────────────────

function GuidePanel({
  guide,
  voice,
  hasDesktop,
}: {
  guide: ReturnType<typeof useGuide>;
  voice: ReturnType<typeof useVoice>;
  hasDesktop: boolean;
}) {
  const [q, setQ] = useState("");
  const submit = () => {
    const t = q.trim();
    if (!t) return;
    setQ("");
    void guide.guide(t);
  };

  return (
    <>
      <div className="max-h-[460px] space-y-3 overflow-y-auto px-4 py-3.5">
        {!hasDesktop && <p className="notice">Guide mode reads your screen — desktop app only.</p>}
        {guide.error && <p className="notice">{guide.error}</p>}

        {!guide.result && !guide.working && !guide.error && (
          <p className="px-1 py-6 text-center text-sm text-muted">
            Ask how to do something in the app that&rsquo;s open. I&rsquo;ll read your screen and point at
            the button.
          </p>
        )}

        {guide.working && (
          <div className="reading-chip">
            <ScanEye className="h-3.5 w-3.5" /> Looking at your screen…
          </div>
        )}

        {guide.result && (
          <div className="answer-card space-y-3 p-3.5">
            {guide.result.steps?.length > 0 && !guide.result.done && (
              <p className="text-[11px] font-medium uppercase tracking-widest text-indigo-300">
                Step {Math.min(guide.step + 1, guide.result.steps.length)} of{" "}
                {guide.result.steps.length}
              </p>
            )}

            <p className="text-[13px] leading-relaxed">{guide.result.say}</p>

            {guide.result.point && !guide.result.done && (
              <p className="flex items-center gap-1.5 text-xs text-indigo-300">
                <MousePointerClick className="h-3.5 w-3.5" /> Pointing at{" "}
                <span className="text-foreground">{guide.result.point.label}</span>
              </p>
            )}

            {guide.result.steps?.length > 0 && (
              <ol className="space-y-1.5 text-[13px]">
                {guide.result.steps.map((s, i) => {
                  const state = i < guide.step ? "past" : i === guide.step ? "now" : "future";
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

            {guide.result.done ? (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-emerald-300">
                  <Wand2 className="h-3.5 w-3.5" /> That&rsquo;s the whole thing.
                </span>
                <button onClick={guide.clear} className="text-xs text-muted hover:text-foreground">
                  Done
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <button onClick={guide.clear} className="text-xs text-muted hover:text-foreground">
                  Stop
                </button>
                {guide.result.steps?.length > 1 && (
                  <button
                    onClick={() => void guide.next()}
                    disabled={guide.working}
                    className="cbtn-primary"
                  >
                    {guide.working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Next step →"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {voice.error && <p className="notice mx-4 mb-2">{voice.error}</p>}
      <InputRow
        value={q}
        onChange={setQ}
        onSubmit={submit}
        busy={guide.working}
        placeholder={guide.result ? "Ask a follow-up…" : "How do I…?"}
        mic={{
          recording: voice.recording,
          busy: voice.busy,
          toggle: () => voice.toggle((t) => guide.guide(t)),
        }}
      />
    </>
  );
}

// ── Act panel ────────────────────────────────────────────────────────────────

function ActPanel({
  act,
  voice,
  hasDesktop,
}: {
  act: ReturnType<typeof useAct>;
  voice: ReturnType<typeof useVoice>;
  hasDesktop: boolean;
}) {
  const [cmd, setCmd] = useState("");
  const submit = () => {
    const t = cmd.trim();
    if (!t) return;
    setCmd("");
    void act.run(t);
  };

  return (
    <>
      <div className="max-h-[460px] space-y-2.5 overflow-y-auto px-4 py-3.5">
        {!hasDesktop && <p className="notice">Commands run on your computer — desktop app only.</p>}

        {act.log.length === 0 && (
          <div className="px-1 py-5 text-center text-sm text-muted">
            <p>Tell me to open something — an app, a website, a search.</p>
            <p className="mt-1 text-xs text-muted/80">
              Try: &ldquo;open Spotify&rdquo; · &ldquo;search YouTube for lofi&rdquo; ·
              &ldquo;open my email&rdquo;
            </p>
          </div>
        )}

        {act.log.map((e, i) => (
          <div key={i} className="answer-card p-3.5">
            <p className="mb-1 text-[11px] uppercase tracking-widest text-muted">{e.command}</p>
            {e.say && <p className="text-[13px] leading-relaxed">{e.say}</p>}
            {e.done && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-300">
                <Wand2 className="h-3.5 w-3.5" /> {e.done}
              </p>
            )}
            {e.error && <p className="mt-1.5 text-xs text-amber-300/90">{e.error}</p>}
          </div>
        ))}
      </div>

      {voice.error && <p className="notice mx-4 mb-2">{voice.error}</p>}
      <InputRow
        value={cmd}
        onChange={setCmd}
        onSubmit={submit}
        busy={act.busy}
        placeholder="Open an app, site, or search…"
        mic={{
          recording: voice.recording,
          busy: voice.busy,
          toggle: () => voice.toggle((t) => act.run(t)),
        }}
      />
    </>
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

function Seg({
  children,
  active,
  onClick,
  icon: Icon,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      onClick={onClick}
      className={`press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
        active ? "bg-white/12 text-foreground" : "text-muted hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
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
