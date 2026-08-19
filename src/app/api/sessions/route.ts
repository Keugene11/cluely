import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUser } from "@/lib/auth";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessions = await sql`
    select s.id, s.title, s.kind, s.status, s.notes, s.started_at, s.ended_at,
           (select count(*) from transcript_lines t where t.session_id = s.id)::int as line_count,
           (select count(*) from assists a where a.session_id = s.id)::int as assist_count
    from sessions s
    where s.user_id = ${user.id}
    order by s.started_at desc
    limit 100
  `;
  return NextResponse.json({ sessions });
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, kind } = await req.json().catch(() => ({}));
  const rows = await sql`
    insert into sessions (user_id, title, kind)
    values (${user.id}, ${String(title || "Untitled session").slice(0, 200)}, ${String(kind || "meeting")})
    returning id, title, kind, status, started_at
  `;
  return NextResponse.json({ session: rows[0] });
}
