"use client";

import { useEffect, useRef, useState } from "react";
import {
  Compass,
  CornerDownLeft,
  Download,
  Eye,
  EyeOff,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  MousePointerClick,
  Radio,
  ScanEye,
  Sparkles,
  Square,
  User,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useLiveSession } from "@/hooks/use-live-session";
import { useGuide } from "@/hooks/use-guide";
import { getDesktop, type DesktopBridge, type UpdateState } from "@/lib/desktop";
import { AnswerBody } from "@/components/answer-body";

/** Drag the whole window by its header, the way a frameless app does. */
const dragStyle = { WebkitAppRegion: "drag" } as React.CSSProperties;
const noDragStyle = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

type Mode = "assist" | "guide";

export function Overlay() {
  const live = useLiveSession();
  const [desktop, setDesktop] = useState<DesktopBridge | null>(null);
  const [mode, setMode] = useState<Mode>("assist");
  const [voiceOn, setVoiceOn] = useState(true);
  const guide = useGuide(voiceOn);

  const [hidden, setHidden] = useState(false);
  const [clickThrough, setClickThrough] = useState(false);
  const [platform, setPlatform] = useState("");
  const [update, setUpdate] = useState<UpdateState | null>(null);

  useEffect(() => {
    const bridge = getDesktop();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDesktop(bridge);
    if (!bridge) return;

    void bridge.getState().then((state) => {
      setHidden(state.contentProtection);
      setClickThrough(state.clickThrough);
      setPlatform(state.platform);
    });
    void bridge.getUpdateState().then(setUpdate);

    const offState = bridge.onState((state) => {
      setHidden(state.contentProtection);
      setClickThrough(state.clickThrough);
    });
    const offUpdate = bridge.onUpdate(setUpdate);
    return () => {
      offState();
      offUpdate();
    };
  }, []);

  // The voice-guide hotkey switches to Guide mode and starts listening.
  useEffect(() => {
    if (!desktop) return;
    return desktop.onVoiceGuide(() => {
      setMode("guide");
      guide.listen();
    });
  }, [desktop, guide]);

  const canSeeScreen = Boolean(desktop);

  const chrome = {
    desktop,
    hidden,
    clickThrough,
    platform,
    update,
    voiceOn,
    onToggleVoice: () => setVoiceOn((v) => !v),
    mode,
    setMode,
    onClose: () => desktop?.quit(),
    onToggleHidden: async () => {
      if (!desktop) return;
      setHidden(await desktop.setContentProtection(!hidden));
    },
    onToggleClickThrough: async () => {
      if (!desktop) return;
      setClickThrough(await desktop.setClickThrough(!clickThrough));
    },
  };

  if (mode === "guide") {
    return (
      <Shell {...chrome} onInstall={() => desktop?.installUpdate()}>
        <GuideBody guide={guide} canSeeScreen={canSeeScreen} />
      </Shell>
    );
  }

  return (
    <Shell
      {...chrome}
      onInstall={() => desktop?.installUpdate()}
      status={
        live.sessionId ? (
          <span className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                live.listening ? "live-dot bg-red-500" : "bg-muted"
              }`}
            />
            {live.listening ? "listening" : "paused"}
          </span>
        ) : undefined
      }
    >
      <AssistBody live={live} canSeeScreen={canSeeScreen} />
    </Shell>
  );
}

// ── Guide mode ───────────────────────────────────────────────────────────────

function GuideBody({
  guide,
  canSeeScreen,
}: {
  guide: ReturnType<typeof useGuide>;
  canSeeScreen: boolean;
}) {
  const [question, setQuestion] = useState("");

  function ask() {
    const q = question.trim();
    if (!q) return;
    setQuestion("");
    void guide.guide(q);
  }

  return (
    <>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3.5" style={noDragStyle}>
        {!canSeeScreen && (
          <p className="answer-card p-3 text-xs leading-relaxed text-amber-300/90">
            Guide mode reads your screen and points at what to click — it only works in the desktop
            app.
          </p>
        )}

        {guide.error && (
          <p className="answer-card p-3 text-xs leading-relaxed text-amber-300/90">{guide.error}</p>
        )}

        {!guide.result && !guide.working && !guide.error && (
          <div className="space-y-2 text-sm text-muted">
            <p>
              Ask how to do something in the app that&rsquo;s open — video editing, design, a
              spreadsheet. I&rsquo;ll read your screen, talk you through it, and point at the button.
            </p>
            <p className="text-xs text-muted/80">
              Try: &ldquo;how do I add a transition between two clips?&rdquo;
            </p>
          </div>
        )}

        {guide.working && (
          <div className="reading-chip flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-foreground/80">
            <ScanEye className="h-3.5 w-3.5" /> Looking at your screen…
          </div>
        )}

        {guide.result && (
          <div className="answer-card rise space-y-3 p-3.5">
            <p className="text-[13px] leading-relaxed">{guide.result.say}</p>

            {guide.result.point && (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <MousePointerClick className="h-3.5 w-3.5" /> Pointing at{" "}
                <span className="text-foreground">{guide.result.point.label}</span>
              </p>
            )}

            {guide.result.steps?.length > 0 && (
              <ol className="space-y-1.5 text-[13px]">
                {guide.result.steps.map((step, i) => (
                  <li key={i} className="flex gap-2.5 leading-relaxed">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] text-muted">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            )}

            <button
              onClick={guide.clear}
              className="press text-xs text-muted hover:text-foreground"
            >
              Clear the pointer
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2.5 border-t border-white/8 p-3" style={noDragStyle}>
        <div className="flex items-end gap-2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                ask();
              }
            }}
            rows={1}
            placeholder="How do I…?"
            className="flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-white/25"
          />
          <button
            onClick={guide.listening ? guide.stopListening : guide.listen}
            className={`press flex h-[42px] w-[42px] items-center justify-center rounded-xl border ${
              guide.listening
                ? "border-red-500/50 bg-red-500/15 text-red-300"
                : "border-white/10 bg-white/5 text-muted hover:text-foreground"
            }`}
            title="Ask by voice (Ctrl+Shift+G)"
          >
            {guide.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <button
            onClick={ask}
            disabled={guide.working}
            className="press flex h-[42px] w-[42px] items-center justify-center rounded-xl bg-foreground text-background disabled:opacity-60"
            aria-label="Ask"
          >
            {guide.working ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CornerDownLeft className="h-4 w-4" />
            )}
          </button>
        </div>
        {guide.listening && (
          <p className="text-center text-[11px] text-red-300">Listening — ask your question…</p>
        )}
      </div>
    </>
  );
}

// ── Assist mode ──────────────────────────────────────────────────────────────

function AssistBody({
  live,
  canSeeScreen,
}: {
  live: ReturnType<typeof useLiveSession>;
  canSeeScreen: boolean;
}) {
  const [title, setTitle] = useState("");
  const [ended, setEnded] = useState(false);
  const answersEndRef = useRef<HTMLDivElement>(null);

  const desktop = getDesktop();

  // Global hotkey (Ctrl+Enter) arrives from the main process.
  useEffect(() => {
    if (!desktop) return;
    return desktop.onAssist(() => void live.ask());
  }, [desktop, live]);

  // In-window hotkey too.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void live.ask();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [live]);

  useEffect(() => {
    answersEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [live.assists, live.capturing]);

  if (!live.sessionId) {
    return (
      <div className="flex flex-1 flex-col justify-center gap-3 px-4 pb-5" style={noDragStyle}>
        <p className="text-sm leading-relaxed text-muted">
          Name what you&rsquo;re doing. Cluely listens, reads your screen, and answers on{" "}
          <kbd>Ctrl</kbd> + <kbd>Enter</kbd>.
        </p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Pricing call · coding round · study session"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-white/25"
        />
        <button
          onClick={() => live.start(title, "meeting")}
          disabled={live.starting}
          className="press flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-2.5 text-sm font-medium text-background disabled:opacity-60"
        >
          {live.starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
          Start
        </button>
        {canSeeScreen && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
            <ScanEye className="h-3.5 w-3.5" /> Screen reading is on for this device
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3.5" style={noDragStyle}>
        {live.micError && (
          <p className="answer-card p-3 text-xs leading-relaxed text-amber-300/90">
            {live.micError}
          </p>
        )}

        {live.assists.length === 0 && !live.micError && (
          <div className="space-y-2.5">
            <p className="text-sm leading-relaxed text-muted">
              Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> and I answer what&rsquo;s on your screen or
              what was just asked of you.
            </p>
            {canSeeScreen && (
              <p className="flex items-center gap-1.5 text-xs text-muted/80">
                <ScanEye className="h-3.5 w-3.5" /> I can see your screen when you ask.
              </p>
            )}
          </div>
        )}

        {live.assists.map((assist, i) => (
          <div key={i} className="answer-card rise p-3.5">
            {assist.question && (
              <p className="mb-1.5 text-[11px] uppercase tracking-widest text-muted">
                {assist.question}
              </p>
            )}
            {assist.answer ? (
              <AnswerBody>{assist.answer}</AnswerBody>
            ) : (
              <p className="text-[13px] text-muted">thinking…</p>
            )}
            {!assist.done && assist.answer && (
              <span className="mt-1 inline-block h-3.5 w-1.5 translate-y-0.5 bg-foreground/70" />
            )}
          </div>
        ))}

        {live.capturing && (
          <div className="reading-chip flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-foreground/80">
            <ScanEye className="h-3.5 w-3.5" /> Reading your screen…
          </div>
        )}

        <div ref={answersEndRef} />
      </div>

      <div className="space-y-2.5 border-t border-white/8 p-3" style={noDragStyle}>
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
            rows={1}
            placeholder="Ask anything, or just hit Enter…"
            className="flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-white/25"
          />
          <button
            onClick={live.ask}
            disabled={live.asking}
            className="press flex h-[42px] w-[42px] items-center justify-center rounded-xl bg-foreground text-background disabled:opacity-60"
            aria-label="Ask"
          >
            {live.asking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CornerDownLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Pill onClick={() => live.setSpeaker(live.speaker === "them" ? "me" : "them")}>
              {live.speaker === "me" ? <User className="h-3 w-3" /> : <Users className="h-3 w-3" />}
              {live.speaker === "me" ? "Me" : "Them"}
            </Pill>
            <Pill onClick={live.listening ? live.stopListening : live.startListening}>
              {live.listening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
              {live.listening ? "Pause" : "Resume"}
            </Pill>
          </div>

          <button
            onClick={async () => {
              await live.end();
              setEnded(true);
            }}
            disabled={live.ending || ended}
            className="press flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1 text-[11px] font-medium text-background disabled:opacity-60"
          >
            {live.ending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
            {ended ? "Notes in app" : "End"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Shared chrome ────────────────────────────────────────────────────────────

function Pill({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="press flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-muted hover:border-white/25 hover:text-foreground"
    >
      {children}
    </button>
  );
}

function UpdateBanner({ update, onInstall }: { update: UpdateState; onInstall: () => void }) {
  if (update.status === "ready") {
    return (
      <div
        className="flex items-center justify-between gap-2 border-b border-white/8 bg-white/5 px-4 py-1.5 text-[11px]"
        style={noDragStyle}
      >
        <span className="flex items-center gap-1.5 text-foreground">
          <Download className="h-3.5 w-3.5" />
          Update {update.version} ready
        </span>
        <button
          onClick={onInstall}
          className="press rounded-full bg-foreground px-2.5 py-0.5 font-medium text-background"
        >
          Restart
        </button>
      </div>
    );
  }
  if (update.status === "downloading") {
    return (
      <p className="border-b border-white/8 bg-white/5 px-4 py-1.5 text-[11px] text-muted">
        Downloading update… {update.progress}%
      </p>
    );
  }
  return null;
}

function Shell({
  children,
  desktop,
  onClose,
  onInstall,
  status,
  mode,
  setMode,
  voiceOn,
  onToggleVoice,
  update,
  hidden,
  clickThrough,
  platform,
  onToggleHidden,
  onToggleClickThrough,
}: {
  children: React.ReactNode;
  desktop: DesktopBridge | null;
  onClose: () => void;
  onInstall: () => void;
  status?: React.ReactNode;
  mode: Mode;
  setMode: (m: Mode) => void;
  voiceOn: boolean;
  onToggleVoice: () => void;
  update: UpdateState | null;
  hidden: boolean;
  clickThrough: boolean;
  platform: string;
  onToggleHidden: () => void;
  onToggleClickThrough: () => void;
}) {
  return (
    <div className="glass glass-edge relative flex h-screen flex-col overflow-hidden rounded-[18px]">
      <div className="overlay-glow" />

      <header
        className="relative flex items-center justify-between gap-2 border-b border-white/8 px-4 py-2.5"
        style={dragStyle}
      >
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/10">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          Cluely
          {status && <span className="text-[11px] font-normal text-muted">{status}</span>}
        </span>

        <div className="flex items-center gap-1" style={noDragStyle}>
          <button
            onClick={onToggleVoice}
            title={voiceOn ? "Voice on — click to mute" : "Voice off — click to unmute"}
            className={`press rounded-lg p-1.5 ${
              voiceOn ? "bg-white/10 text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {voiceOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>

          {desktop && (
            <>
              <button
                onClick={onToggleClickThrough}
                title={
                  clickThrough
                    ? "Clicks pass through (Ctrl+Shift+H)"
                    : "Clicks land on this panel (Ctrl+Shift+H)"
                }
                className={`press rounded-lg p-1.5 ${
                  clickThrough ? "bg-white/10 text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                <MousePointerClick className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onToggleHidden}
                title={
                  hidden
                    ? "Hidden from screen capture — click to show"
                    : "Visible in screen shares — click to hide"
                }
                className={`press flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] ${
                  hidden ? "bg-white/10 text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </>
          )}

          <button
            onClick={onClose}
            className="press rounded-lg p-1.5 text-muted hover:bg-white/10 hover:text-foreground"
            aria-label="Quit"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Mode switcher */}
      <div className="flex gap-1 border-b border-white/8 px-3 py-2" style={noDragStyle}>
        <ModeTab active={mode === "assist"} onClick={() => setMode("assist")} icon={MessageSquare}>
          Assist
        </ModeTab>
        <ModeTab active={mode === "guide"} onClick={() => setMode("guide")} icon={Compass}>
          Guide me
        </ModeTab>
      </div>

      {update && <UpdateBanner update={update} onInstall={onInstall} />}

      {hidden && platform === "darwin" && (
        <p className="border-b border-white/8 bg-white/5 px-4 py-1.5 text-[11px] text-amber-300/90">
          macOS: apps capturing via ScreenCaptureKit still see this window.
        </p>
      )}

      {!desktop && (
        <p className="border-b border-white/8 bg-white/5 px-4 py-1.5 text-[11px] text-muted">
          Running in a browser tab — screen reading, voice, and the cursor need the desktop app.
        </p>
      )}

      {children}
    </div>
  );
}

function ModeTab({
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
      className={`press flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium ${
        active ? "bg-white/10 text-foreground" : "text-muted hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}
