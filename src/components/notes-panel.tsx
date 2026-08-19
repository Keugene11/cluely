"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ClipboardCopy, FileText, Loader2, Sparkles } from "lucide-react";
import type { MeetingNotes } from "@/lib/db";

export function NotesPanel({
  sessionId,
  initialNotes,
  autoGenerate,
  hasTranscript,
}: {
  sessionId: string;
  initialNotes: MeetingNotes | null;
  autoGenerate: boolean;
  hasTranscript: boolean;
}) {
  const [notes, setNotes] = useState<MeetingNotes | null>(initialNotes);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const triedRef = useRef(false);

  const generate = useCallback(async () => {
    setPending(true);
    setError(null);

    const res = await fetch(`/api/sessions/${sessionId}/notes`, { method: "POST" });
    const body = await res.json().catch(() => ({}));

    setPending(false);
    if (!res.ok) {
      setError(body.error ?? "Could not write the notes.");
      return;
    }
    setNotes(body.notes);
  }, [sessionId]);

  useEffect(() => {
    if (autoGenerate && !initialNotes && hasTranscript && !triedRef.current) {
      triedRef.current = true;
      void generate();
    }
  }, [autoGenerate, initialNotes, hasTranscript, generate]);

  async function copyEmail() {
    if (!notes) return;
    await navigator.clipboard.writeText(notes.follow_up_email);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (!notes) {
    return (
      <div className="card flex flex-col items-center gap-4 px-6 py-14 text-center">
        <FileText className="h-7 w-7 text-muted" />
        <div>
          <p className="font-medium">{pending ? "Writing your notes…" : "No notes yet"}</p>
          <p className="mt-1 text-sm text-muted">
            {hasTranscript
              ? "Summary, key points, action items, and a follow-up draft."
              : "Nothing was transcribed in this session, so there is nothing to summarize."}
          </p>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </div>
        {hasTranscript && (
          <button
            onClick={generate}
            disabled={pending}
            className="press flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {pending ? "Working" : "Write the notes"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card p-6">
        <h2 className="text-sm uppercase tracking-widest text-muted">Summary</h2>
        <p className="mt-3 leading-relaxed">{notes.summary}</p>
      </div>

      {notes.key_points?.length > 0 && (
        <div className="card p-6">
          <h2 className="text-sm uppercase tracking-widest text-muted">Key points</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {notes.key_points.map((point, i) => (
              <li key={i} className="flex gap-2.5 leading-relaxed">
                <span className="text-muted">•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card p-6">
        <h2 className="text-sm uppercase tracking-widest text-muted">Action items</h2>
        {notes.action_items?.length ? (
          <ul className="mt-3 space-y-2.5 text-sm">
            {notes.action_items.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-0.5 rounded-full border border-line px-2 py-0.5 text-xs capitalize text-muted">
                  {item.owner}
                </span>
                <span className="leading-relaxed">{item.task}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">Nobody committed to anything.</p>
        )}
      </div>

      {notes.follow_up_email && (
        <div className="card p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm uppercase tracking-widest text-muted">Follow-up draft</h2>
            <button
              onClick={copyEmail}
              className="press flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs text-muted hover:text-foreground"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">
            {notes.follow_up_email}
          </p>
        </div>
      )}

      <button
        onClick={generate}
        disabled={pending}
        className="press flex items-center gap-2 text-sm text-muted hover:text-foreground disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Rewrite the notes
      </button>
    </div>
  );
}
