"use client";

import { useCallback, useRef, useState } from "react";

// Local speech-to-text with Whisper (transformers.js), loaded from the CDN at
// runtime so it needs no API key and doesn't bloat the installer. The model
// (~40MB) downloads once on first use, then the browser caches it.
const MODEL = "Xenova/whisper-tiny.en";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transcriberPromise: Promise<any> | null = null;

// A runtime-only ESM import of a URL: `new Function` hides it from both
// TypeScript's module resolver and the bundler's static analysis.
const importFromUrl = new Function("url", "return import(url)") as (
  url: string,
) => Promise<{ pipeline: (...a: unknown[]) => Promise<unknown>; env: { allowLocalModels: boolean } }>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getTranscriber(): Promise<any> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline, env } = await importFromUrl(
        "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2",
      );
      env.allowLocalModels = false;
      return pipeline("automatic-speech-recognition", MODEL);
    })();
  }
  return transcriberPromise;
}

/** Decode a recorded blob to the 16kHz mono Float32 audio Whisper expects. */
async function toMono16k(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer();
  const AudioCtx =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const decoded = await ctx.decodeAudioData(buf);
  await ctx.close();

  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

/**
 * Push-to-talk voice input. `toggle(onText)` starts recording; calling it again
 * stops and transcribes, then hands the text to `onText`. Works with no key.
 */
export function useVoice() {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false); // loading model or transcribing
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const onTextRef = useRef<((t: string) => void) | null>(null);

  const start = useCallback(async (onText: (t: string) => void) => {
    setError(null);
    onTextRef.current = onText;
    getTranscriber().catch(() => {}); // warm the model while the user talks

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];

      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setBusy(true);
        try {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
          const audio = await toMono16k(blob);
          const asr = await getTranscriber();
          const out = await asr(audio);
          const text = String(out?.text ?? "").trim();
          if (text && !/^\[?\s*(blank|inaudible)\s*\]?$/i.test(text)) onTextRef.current?.(text);
          else setError("Didn't catch that — try again.");
        } catch {
          setError("Couldn't transcribe that.");
        } finally {
          setBusy(false);
        }
      };

      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      setError("Microphone access was blocked.");
    }
  }, []);

  const stop = useCallback(() => {
    if (recRef.current?.state === "recording") recRef.current.stop();
  }, []);

  const toggle = useCallback(
    (onText: (t: string) => void) => {
      if (recording) stop();
      else void start(onText);
    },
    [recording, start, stop],
  );

  return { recording, busy, error, toggle, stop };
}
