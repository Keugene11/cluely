"use client";

import { useEffect, useRef, useState } from "react";
import {
  CornerDownLeft,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Mic,
  MicOff,
  MonitorDot,
  MousePointerClick,
  Radio,
  ScanEye,
  Sparkles,
  Square,
  User,
  Users,
  X,
} from "lucide-react";
import { useLiveSession } from "@/hooks/use-live-session";
import { getDesktop, type DesktopBridge, type UpdateState } from "@/lib/desktop";

/** Drag the whole window by its header, the way a frameless app does. */
const dragStyle = { WebkitAppRegion: "drag" } as React.CSSProperties;
const noDragStyle = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

export function Overlay() {
  const live = useLiveSession();
  const [desktop, setDesktop] = useState<DesktopBridge | null>(null);
  const [title, setTitle] = useState("");
  const [hidden, setHidden] = useState(false);
  const [clickThrough, setClickThrough] = useState(false);
  const [platform, setPlatform] = useState("");
  const [ended, setEnded] = useState(false);
  const [update, setUpdate] = useState<UpdateState | null>(null);
  const answersEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bridge = getDesktop();
    // Resolved in an effect on purpose: the bridge only exists client-side, and
    // reading it during render would make the desktop banner mismatch on hydration.
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

  // The global hotkey arrives from the main process, app focused or not.
  useEffect(() => {
    if (!desktop) return;
    return desktop.onAssist(() => void live.ask());
  }, [desktop, live]);

  // In-window hotkey too, so it works when the panel has focus.
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

  const canSeeScreen = Boolean(desktop);
  const lastLines = live.lines.slice(-2);

  const updateBanner = update ? (
    <UpdateBanner update={update} onInstall={() => desktop?.installUpdate()} />
  ) : null;

  // ---- Start ----------------------------------------------------------------
  if (!live.sessionId) {
    return (
      <Shell desktop={desktop} onClose={() => desktop?.quit()} banner={updateBanner}>
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
            {live.starting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Radio className="h-4 w-4" />
            )}
            Start
          </button>
          {canSeeScreen && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
              <ScanEye className="h-3.5 w-3.5" /> Screen reading is on for this device
            </p>
          )}
        </div>
      </Shell>
    );
  }

  // ---- Live -----------------------------------------------------------------
  return (
    <Shell
      desktop={desktop}
      onClose={() => desktop?.quit()}
      hidden={hidden}
      clickThrough={clickThrough}
      platform={platform}
      onToggleHidden={async () => {
        if (!desktop) return;
        setHidden(await desktop.setContentProtection(!hidden));
      }}
      onToggleClickThrough={async () => {
        if (!desktop) return;
        setClickThrough(await desktop.setClickThrough(!clickThrough));
      }}
      banner={updateBanner}
      status={
        <span className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              live.listening ? "live-dot bg-red-500" : "bg-muted"
            }`}
          />
          {live.listening ? "listening" : "paused"}
        </span>
      }
    >
      {/* Answers */}
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
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
              {assist.answer || <span className="text-muted">thinking…</span>}
              {!assist.done && assist.answer && (
                <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 bg-foreground/70" />
              )}
            </p>
          </div>
        ))}

        {live.capturing && (
          <div className="reading-chip flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-foreground/80">
            <ScanEye className="h-3.5 w-3.5" /> Reading your screen…
          </div>
        )}

        <div ref={answersEndRef} />
      </div>

      {/* Transcript ticker */}
      {lastLines.length > 0 && (
        <div className="border-t border-white/8 px-4 py-2" style={noDragStyle}>
          {lastLines.map((line, i) => (
            <p key={i} className="truncate text-[11px] text-muted">
              <span className={line.speaker === "me" ? "" : "text-foreground/70"}>
                {line.speaker === "me" ? "Me: " : "Them: "}
              </span>
              {line.text}
            </p>
          ))}
          {live.interim && (
            <p className="truncate text-[11px] italic text-muted/60">{live.interim}</p>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="space-y-2.5 border-t border-white/8 p-3" style={noDragStyle}>
        <div className="flex items-end gap-2">
          <textarea
            value={live.question}
            onChange={(e) => live.setQuestion(e.target.value)}
            rows={1}
            placeholder="Ask anything, or just hit the hotkey…"
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
            <Pill
              onClick={() => live.setSpeaker(live.speaker === "them" ? "me" : "them")}
              title="Who is speaking right now"
            >
              {live.speaker === "me" ? (
                <User className="h-3 w-3" />
              ) : (
                <Users className="h-3 w-3" />
              )}
              {live.speaker === "me" ? "Me" : "Them"}
            </Pill>

            <Pill onClick={live.listening ? live.stopListening : live.startListening}>
              {live.listening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
              {live.listening ? "Pause" : "Resume"}
            </Pill>

            {canSeeScreen && (
              <span
                className="flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-muted"
                title="The assistant reads your screen when you ask"
              >
                <MonitorDot className="h-3 w-3" /> Screen
              </span>
            )}
          </div>

          <button
            onClick={async () => {
              await live.end();
              setEnded(true);
            }}
            disabled={live.ending || ended}
            className="press flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1 text-[11px] font-medium text-background disabled:opacity-60"
          >
            {live.ending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Square className="h-3 w-3" />
            )}
            {ended ? "Notes in app" : "End"}
          </button>
        </div>
      </div>
    </Shell>
  );
}

function Pill({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="press flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-muted hover:border-white/25 hover:text-foreground"
    >
      {children}
    </button>
  );
}

function UpdateBanner({
  update,
  onInstall,
}: {
  update: UpdateState;
  onInstall: () => void;
}) {
  if (update.status === "ready") {
    return (
      <div
        className="flex items-center justify-between gap-2 border-b border-white/8 bg-white/5 px-4 py-1.5 text-[11px]"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
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
  status,
  banner,
  hidden,
  clickThrough,
  platform,
  onToggleHidden,
  onToggleClickThrough,
}: {
  children: React.ReactNode;
  desktop: DesktopBridge | null;
  onClose: () => void;
  status?: React.ReactNode;
  banner?: React.ReactNode;
  hidden?: boolean;
  clickThrough?: boolean;
  platform?: string;
  onToggleHidden?: () => void;
  onToggleClickThrough?: () => void;
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
          {onToggleClickThrough && (
            <button
              onClick={onToggleClickThrough}
              title={
                clickThrough
                  ? "Clicks pass through to the app underneath (Ctrl+Shift+H)"
                  : "Clicks land on this panel (Ctrl+Shift+H)"
              }
              className={`press rounded-lg p-1.5 ${
                clickThrough ? "bg-white/10 text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              <MousePointerClick className="h-3.5 w-3.5" />
            </button>
          )}

          {onToggleHidden && (
            <button
              onClick={onToggleHidden}
              title={
                hidden
                  ? "Hidden from screen capture — click to show again"
                  : "Visible in screen shares and recordings — click to hide"
              }
              className={`press flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] ${
                hidden ? "bg-white/10 text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {hidden ? "Hidden" : "Visible"}
            </button>
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

      {banner}

      {hidden && platform === "darwin" && (
        <p className="border-b border-white/8 bg-white/5 px-4 py-1.5 text-[11px] text-amber-300/90">
          macOS: apps capturing via ScreenCaptureKit still see this window.
        </p>
      )}

      {!desktop && (
        <p className="border-b border-white/8 bg-white/5 px-4 py-1.5 text-[11px] text-muted">
          Running in a browser tab — screen reading and window controls need the desktop app.
        </p>
      )}

      {children}
    </div>
  );
}
