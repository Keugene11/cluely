import Link from "next/link";
import { ArrowUpRight, Mic, Radio } from "lucide-react";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth";

function when(date: string) {
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function duration(start: string, end: string | null) {
  if (!end) return "still live";
  const mins = Math.max(1, Math.round((+new Date(end) - +new Date(start)) / 60000));
  return `${mins} min`;
}

export default async function SessionsPage() {
  const user = await requireUser();

  const sessions = (await sql`
    select s.id, s.title, s.kind, s.status, s.started_at, s.ended_at,
           (s.notes is not null) as has_notes,
           (select count(*) from transcript_lines t where t.session_id = s.id)::int as line_count,
           (select count(*) from assists a where a.session_id = s.id)::int as assist_count
    from sessions s
    where s.user_id = ${user.id}
    order by s.started_at desc
    limit 50
  `) as {
    id: string;
    title: string;
    kind: string;
    status: string;
    started_at: string;
    ended_at: string | null;
    has_notes: boolean;
    line_count: number;
    assist_count: number;
  }[];

  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Sessions</h1>
          <p className="mt-2 text-muted">Everything Cluely has sat in on.</p>
        </div>
        <Link
          href="/app/live"
          className="press inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background"
        >
          <Radio className="h-4 w-4" />
          Go live
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="card mt-10 flex flex-col items-center gap-4 px-6 py-20 text-center">
          <Mic className="h-8 w-8 text-muted" />
          <div>
            <p className="text-lg font-medium">No sessions yet</p>
            <p className="mt-1 text-sm text-muted">
              Start one before your next call and press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> when you
              need an answer.
            </p>
          </div>
          <Link
            href="/app/live"
            className="press rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background"
          >
            Start your first session
          </Link>
        </div>
      ) : (
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/app/s/${session.id}`}
              className="press card p-6 hover:border-foreground/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-medium">{session.title}</h2>
                  <p className="mt-1 text-sm text-muted">
                    {when(session.started_at)} · {duration(session.started_at, session.ended_at)}
                  </p>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted" />
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-muted">
                {session.status === "live" && (
                  <span className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-foreground">
                    <span className="live-dot h-1.5 w-1.5 rounded-full bg-red-500" />
                    live
                  </span>
                )}
                <span className="rounded-full border border-line px-2.5 py-1 capitalize">
                  {session.kind}
                </span>
                <span className="rounded-full border border-line px-2.5 py-1">
                  {session.line_count} lines
                </span>
                <span className="rounded-full border border-line px-2.5 py-1">
                  {session.assist_count} assists
                </span>
                {session.has_notes && (
                  <span className="rounded-full border border-line px-2.5 py-1">notes ready</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
