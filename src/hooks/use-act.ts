"use client";

import { useCallback, useState } from "react";
import { getDesktop } from "@/lib/desktop";

export type ActEntry = { command: string; say: string; done: string | null; error: string | null };

/** Speak text aloud with the browser's built-in voices. */
function speak(text: string, enabled: boolean) {
  if (!enabled || typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}

/**
 * Act: turn a command into a launch (open an app, site, or search) and run it.
 * Deliberately limited to launching — the reliable, safe part of computer control.
 */
export function useAct(voiceEnabled: boolean) {
  const [log, setLog] = useState<ActEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (command: string) => {
      const cmd = command.trim();
      if (!cmd || busy) return;
      setBusy(true);
      setLog((prev) => [...prev, { command: cmd, say: "", done: null, error: null }]);

      const patch = (p: Partial<ActEntry>) =>
        setLog((prev) => prev.map((e, i) => (i === prev.length - 1 ? { ...e, ...p } : e)));

      try {
        const res = await fetch("/api/act", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: cmd }),
        });
        const body = await res.json();
        if (!res.ok) {
          patch({ error: body.error ?? "That didn't work." });
          return;
        }

        const { say, action } = body.result;
        patch({ say });
        speak(say, voiceEnabled);

        if (action.type === "open") {
          const desktop = getDesktop();
          if (!desktop?.open) {
            patch({ error: "Launching only works in the desktop app." });
            return;
          }
          const result = await desktop.open(action.target);
          if (result.ok) patch({ done: action.label || result.message });
          else patch({ error: result.message });
        } else {
          patch({ done: null });
        }
      } catch {
        patch({ error: "Something went wrong." });
      } finally {
        setBusy(false);
      }
    },
    [busy, voiceEnabled],
  );

  return { log, busy, run };
}
