import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { sql, type MeetingNotes } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { NotesPanel } from "@/components/notes-panel";

export default async function SessionPage({
  params,
  searchParams,
}: PageProps<"/app/s/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;

  const rows = (await sql`
    select id, title, kind, status, notes, started_at, ended_at
    from sessions where id = ${id} and user_id = ${user.id}
  `) as {
    id: string;
    title: string;
    kind: string;
    status: string;
    notes: MeetingNotes | null;
    started_at: string;
    ended_at: string | null;
  }[];

  const session = rows[0];
  if (!session) notFound();

  const lines = (await sql`
    select speaker, text from transcript_lines where session_id = ${id} order by id
  `) as { speaker: "me" | "them"; text: string }[];

  const assists = (await sql`
    select question, answer, created_at from assists where session_id = ${id} order by created_at
  `) as { question: string; answer: string; created_at: string }[];

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <Link
        href="/app"
        className="press inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Sessions
      </Link>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{session.title}</h1>
          <p className="mt-2 text-sm text-muted">
            {new Date(session.started_at).toLocaleString()} · {session.kind} · {lines.length} lines ·{" "}
            {assists.length} assists
          </p>
        </div>
        {session.status === "live" && (
          <span className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-red-500" /> still live
          </span>
        )}
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_420px]">
        <div>
          <NotesPanel
            sessionId={session.id}
            initialNotes={session.notes}
            autoGenerate={query?.generate === "1"}
            hasTranscript={lines.length > 0}
          />

          <section className="card mt-5 p-6">
            <h2 className="text-sm uppercase tracking-widest text-muted">Transcript</h2>
            <div className="mt-4 max-h-[420px] space-y-2.5 overflow-y-auto text-sm">
              {lines.length === 0 && <p className="text-muted">Nothing was captured.</p>}
              {lines.map((line, i) => (
                <p key={i} className="leading-relaxed">
                  <span className={line.speaker === "me" ? "text-muted" : "text-foreground"}>
                    {line.speaker === "me" ? "Me: " : "Them: "}
                  </span>
                  <span className="text-muted">{line.text}</span>
                </p>
              ))}
            </div>
          </section>
        </div>

        <aside className="card h-fit p-6">
          <h2 className="flex items-center gap-2 text-sm uppercase tracking-widest text-muted">
            <Sparkles className="h-4 w-4" /> Assists
          </h2>

          {assists.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No answers were pulled up during this one.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {assists.map((assist, i) => (
                <div key={i} className="rounded-xl border border-line bg-surface-2 p-4">
                  {assist.question && (
                    <p className="mb-2 text-xs uppercase tracking-widest text-muted">
                      {assist.question}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{assist.answer}</p>
                  <p className="mt-3 text-xs text-muted">
                    {new Date(assist.created_at).toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
