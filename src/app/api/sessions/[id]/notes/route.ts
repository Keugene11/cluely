import { NextResponse } from "next/server";
import { sql, type MeetingNotes } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { NOTES_SYSTEM } from "@/lib/prompts";
import { completeJson } from "@/lib/openrouter";
import { parseModelJson } from "@/lib/parse";

type Ctx = { params: Promise<{ id: string }> };

/** Generate structured notes for a finished session and store them on the row. */
export async function POST(_req: Request, { params }: Ctx) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const rows = await sql`
    select id, title, kind from sessions where id = ${id} and user_id = ${user.id}
  `;
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lines = await sql`
    select speaker, text from transcript_lines where session_id = ${id} order by id
  `;
  if (lines.length === 0) {
    return NextResponse.json({ error: "Nothing was transcribed in this session yet." }, { status: 400 });
  }

  const transcript = lines
    .map((l) => `${l.speaker === "me" ? "Me" : "Them"}: ${l.text}`)
    .join("\n");

  let text: string;
  try {
    text = await completeJson({
      system: NOTES_SYSTEM,
      text: `Session title: ${rows[0].title}\nType: ${rows[0].kind}\n\nTranscript:\n${transcript}`,
      maxTokens: 4000,
    });
  } catch (err) {
    console.error("notes generation failed", err);
    return NextResponse.json({ error: "Could not reach the model. Try again." }, { status: 503 });
  }

  const notes = parseModelJson<MeetingNotes>(text);
  if (!notes) {
    return NextResponse.json({ error: "Could not parse the generated notes." }, { status: 502 });
  }

  await sql`update sessions set notes = ${JSON.stringify(notes)}::jsonb where id = ${id}`;
  return NextResponse.json({ notes });
}
