"use client";

import { useState } from "react";
import { FileStack, Loader2, Plus, Trash2, Upload } from "lucide-react";
import type { ContextFile } from "@/lib/db";

export function ContextManager({ initialFiles }: { initialFiles: ContextFile[] }) {
  const [files, setFiles] = useState(initialFiles);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!content.trim()) return;
    setPending(true);
    setError(null);

    const res = await fetch("/api/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() || "Untitled", content }),
    });
    const body = await res.json().catch(() => ({}));

    setPending(false);
    if (!res.ok) {
      setError(body.error ?? "Could not save that.");
      return;
    }

    setFiles((prev) => [body.file, ...prev]);
    setName("");
    setContent("");
  }

  /** Text-ish files only — the assistant reads them as plain text. */
  async function onUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setName(file.name);
    setContent(await file.text());
    event.target.value = "";
  }

  async function remove(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    await fetch(`/api/context/${id}`, { method: "DELETE" });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
      <section className="card h-fit p-6">
        <h2 className="flex items-center gap-2 font-medium">
          <Plus className="h-4 w-4" /> Add context
        </h2>
        <p className="mt-2 text-sm text-muted">
          Deal notes, a spec, a job description, last quarter&rsquo;s numbers. Every live answer is
          grounded in these.
        </p>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Northwind account notes)"
          className="mt-4 w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm outline-none placeholder:text-muted focus:border-foreground/40"
        />

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={9}
          placeholder="Paste the text…"
          className="mt-3 w-full resize-none rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm outline-none placeholder:text-muted focus:border-foreground/40"
        />

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={save}
            disabled={pending || !content.trim()}
            className="press flex flex-1 items-center justify-center gap-2 rounded-xl bg-foreground py-3 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </button>

          <label className="press flex cursor-pointer items-center gap-2 rounded-xl border border-line px-4 py-3 text-sm text-muted hover:text-foreground">
            <Upload className="h-4 w-4" />
            File
            <input
              type="file"
              accept=".txt,.md,.csv,.json,.log,text/*"
              onChange={onUpload}
              className="hidden"
            />
          </label>
        </div>
      </section>

      <section>
        {files.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 px-6 py-20 text-center">
            <FileStack className="h-7 w-7 text-muted" />
            <p className="font-medium">Nothing saved yet</p>
            <p className="max-w-sm text-sm text-muted">
              Whatever you would have skimmed right before the call goes here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {files.map((file) => (
              <div key={file.id} className="card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">{file.name}</h3>
                    <p className="mt-1 text-xs text-muted">
                      {file.content.length.toLocaleString()} characters ·{" "}
                      {new Date(file.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => remove(file.id)}
                    className="press rounded-full border border-line p-2 text-muted hover:text-red-400"
                    aria-label={`Delete ${file.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-muted">
                  {file.content.slice(0, 400)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
