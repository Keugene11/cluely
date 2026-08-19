"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDesktop } from "@/lib/desktop";

export type GuideResult = {
  say: string;
  steps: string[];
  point: { x: number; y: number; label: string } | null;
};

/** Minimal shape of the Web Speech API we depend on for voice input. */
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
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/** Speak text aloud with the browser's built-in voices. Free, no API key. */
function speak(text: string, enabled: boolean) {
  if (!enabled || typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  utterance.pitch = 1;
  // Prefer a natural English voice if one is installed.
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => /natural|zira|aria|jenny|samantha/i.test(v.name)) ||
    voices.find((v) => v.lang.startsWith("en"));
  if (preferred) utterance.voice = preferred;
  window.speechSynthesis.speak(utterance);
}

/**
 * The teach/guide flow: capture the screen, ask Claude how to do the thing,
 * speak the answer, and point the on-screen cursor at the next action.
 */
export function useGuide(voiceEnabled: boolean) {
  const [result, setResult] = useState<GuideResult | null>(null);
  const [working, setWorking] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceEnabledRef = useRef(voiceEnabled);
  useEffect(() => void (voiceEnabledRef.current = voiceEnabled), [voiceEnabled]);

  const guide = useCallback(async (question: string) => {
    const desktop = getDesktop();
    if (!desktop?.captureScreen) {
      setError("Guiding needs the desktop app — it reads your screen.");
      return;
    }

    setWorking(true);
    setError(null);

    const image = await desktop.captureScreen().catch(() => null);
    if (!image) {
      setWorking(false);
      setError("Couldn't capture your screen.");
      return;
    }

    const res = await fetch("/api/guide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, image }),
    });

    setWorking(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "The guide failed.");
      return;
    }

    const { result: next } = (await res.json()) as { result: GuideResult };
    setResult(next);
    speak(next.say, voiceEnabledRef.current);
    if (next.point) desktop.point(next.point);
    else desktop.clearPoint();
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    getDesktop()?.clearPoint();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  /** Listen for a spoken question, then guide. Auto-sends when you stop talking. */
  const listen = useCallback(() => {
    const recognition = getRecognition();
    if (!recognition) {
      setError("Voice input isn't available here — type your question instead.");
      return;
    }

    let heard = "";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onresult = (event) => {
      heard = Array.from({ length: event.results.length }, (_, i) => event.results[i][0].transcript)
        .join(" ")
        .trim();
    };
    recognition.onerror = (event) => {
      setListening(false);
      if (event.error === "network") {
        setError("Voice input needs the web app in Chrome — type your question here instead.");
      } else if (event.error === "not-allowed") {
        setError("Microphone access was blocked.");
      }
    };
    recognition.onend = () => {
      setListening(false);
      if (heard) void guide(heard);
    };

    recognitionRef.current = recognition;
    setError(null);
    setListening(true);
    recognition.start();
  }, [guide]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return { result, working, listening, error, guide, listen, stopListening, clear };
}
