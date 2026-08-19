import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const rows = await sql`
    select id, title, kind, status, notes, started_at, ended_at
    from sessions where id = ${id} and user_id = ${user.id}
  `;
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lines = await sql`
    select id, speaker, text, at_ms from transcript_lines where session_id = ${id} order by id
  `;
  const assists = await sql`
    select id, question, answer, created_at from assists where session_id = ${id} order by created_at
  `;

  return NextResponse.json({ session: rows[0], lines, assists });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  if (body.status === "ended") {
    await sql`
      update sessions set status = 'ended', ended_at = now()
      where id = ${id} and user_id = ${user.id}
    `;
  }
  if (typeof body.title === "string" && body.title.trim()) {
    await sql`
      update sessions set title = ${body.title.trim().slice(0, 200)}
      where id = ${id} and user_id = ${user.id}
    `;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  await sql`delete from sessions where id = ${id} and user_id = ${user.id}`;
  return NextResponse.json({ ok: true });
}
