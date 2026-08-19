import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Append captured speech. The client batches lines so we don't write per word. */
export async function POST(req: Request, { params }: Ctx) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const owned = await sql`select id from sessions where id = ${id} and user_id = ${user.id}`;
  if (!owned[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { lines } = await req.json();
  if (!Array.isArray(lines) || lines.length === 0) return NextResponse.json({ ok: true });

  for (const line of lines.slice(0, 50)) {
    const text = String(line?.text ?? "").trim();
    if (!text) continue;
    await sql`
      insert into transcript_lines (session_id, speaker, text, at_ms)
      values (${id}, ${line.speaker === "me" ? "me" : "them"}, ${text.slice(0, 4000)}, ${Number(line.at_ms) || 0})
    `;
  }
  return NextResponse.json({ ok: true });
}
