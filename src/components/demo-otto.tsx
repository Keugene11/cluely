"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MonitorUp, ScreenShare, ScreenShareOff, Sparkles, Volume2, VolumeX } from "lucide-react";
import { useLiveSession } from "@/hooks/use-live-session";
import { useVoice } from "@/hooks/use-voice";
import { Thread } from "@/components/overlay";
import { stopSpeaking } from "@/lib/speech";
import { createScreenShare, supportsScreenShare, type ScreenShare as Share } from "@/lib/screen-share";

/**
 * Otto, running in a browser tab, for anyone — no account.
 *
 * This is the real panel and the real model, not a scripted mock: the same
 * Thread component the desktop overlay renders, the same /api/ask dispatcher,
 * the same streaming. Two things are honestly missing, because a web page
 * cannot have them and pretending otherwise would make a worse demo:
 *
 *   - The screen is shared, not taken. The desktop app screenshots your whole
 *     display silently; here you pick a window in the browser's picker and Otto
 *     sees that and nothing else.
 *   - Nothing gets clicked. Walkthroughs and launching apps need a machine to
 *     drive, so the server turns those tools off for demo requests rather than
 *     offering a "Click it" button that cannot press anything.
 */
export function DemoOtto() {
  const [voiceOn, setVoiceOn] = useState(false); // a page that talks at you unprompted is worse than a quiet one
  const [sharing, setSharing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  const shareRef = useRef<Share | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(supportsScreenShare());
  }, []);

  const capture = useCallback(async () => {
    const share = shareRef.current;
    return share?.active() ? share.capture() : null;
  }, []);

  const live = useLiveSession(voiceOn, { capture, demo: true });
  const voice = useVoice();

  const ask = useCallback((text?: string) => void live.ask(text), [live]);

  const toggleVoice = useCallback(() => {
    setVoiceOn((v) => {
      if (v) stopSpeaking();
      return !v;
    });
  }, []);

  const toggleShare = useCallback(async () => {
    const existing = shareRef.current;
    if (existing?.active()) {
      existing.stop();
      setSharing(false);
      return;
    }

    setStarting(true);
    setShareError(null);
    try {
      const share = existing ?? createScreenShare();
      shareRef.current = share;
      // Ending the share from the browser's own "Stop sharing" bar has to reach
      // this button too, or it keeps claiming Otto can see something.
      share.onEnd(() => setSharing(false));
      const ok = await share.start();
      setSharing(ok);
      if (!ok) setShareError("No window was shared. Otto will answer from your question alone.");
    } finally {
      setStarting(false);
    }
  }, []);

  // Whatever is being shared is still being captured otherwise, and a stream
  // left running keeps the browser's recording indicator up after you leave.
  useEffect(() => () => shareRef.current?.stop(), []);

  return (
    <div className="demo-root mx-auto flex min-h-screen w-full max-w-[760px] flex-col justify-center px-4 py-6">
      {/* The bar, as it looks floating over your desktop. */}
      <div className="cbar">
        <div className="flex items-center gap-2.5 pl-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-gradient-to-br from-indigo-400/30 to-fuchsia-400/20 ring-1 ring-white/10">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-xs text-muted">
            {sharing ? "Reading the window you shared" : "Live demo"}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1">
          {supported && (
            <button
              onClick={toggleShare}
              disabled={starting}
              className={sharing ? "cbtn-ghost" : "cbtn-primary"}
              title={
                sharing
                  ? "Stop sharing — Otto stops seeing it"
                  : "Pick a window for Otto to read"
              }
            >
              {starting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : sharing ? (
                <ScreenShareOff className="h-3.5 w-3.5" />
              ) : (
                <ScreenShare className="h-3.5 w-3.5" />
              )}
              {sharing ? "Stop sharing" : "Share a window"}
            </button>
          )}

          <button
            onClick={toggleVoice}
            title={voiceOn ? "Speaking answers — click to mute" : "Muted — click to hear answers"}
            className={`press flex h-8 w-8 items-center justify-center rounded-lg ${
              voiceOn ? "bg-white/12 text-foreground" : "text-muted hover:bg-white/8 hover:text-foreground"
            }`}
          >
            {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="cpanel mt-2 overflow-hidden">
        <Thread
          live={live}
          voice={voice}
          onAsk={ask}
          empty={
            <div className="px-2 py-5 text-center">
              <p className="text-sm text-foreground">
                {sharing ? "Ask about the window you shared." : "Ask me anything."}
              </p>
              <p className="mx-auto mt-1.5 max-w-[46ch] text-xs leading-relaxed text-muted">
                {sharing
                  ? "Try “what am I looking at”, “what is wrong with this code”, or “what should I say back”."
                  : "Share a window and Otto reads it before answering — the same thing the desktop app does with your whole screen."}
              </p>
              {!supported && (
                <p className="mt-2.5 text-xs text-amber-300/90">
                  This browser can&rsquo;t share a window. Chrome or Edge can; either way you can
                  still type a question.
                </p>
              )}
            </div>
          }
        />
      </div>

      {shareError && <p className="notice mt-2">{shareError}</p>}

      <p className="on-light mt-3 flex items-start gap-2 px-1 text-[11px] leading-relaxed">
        <MonitorUp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          This is the real assistant, answering live. The desktop app adds what a browser tab
          can&rsquo;t do: it sees your whole screen without being asked, hears the call, and clicks
          through the steps for you.{" "}
          <a href="/download" target="_blank" className="underline underline-offset-2">
            Download it
          </a>
          .
        </span>
      </p>
    </div>
  );
}
