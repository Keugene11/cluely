import { NextResponse } from "next/server";
import { sql, type MeetingNotes } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { anthropic, MODEL, NOTES_SYSTEM } from "@/lib/claude";

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

  let response;
  try {
    response = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: NOTES_SYSTEM,
      thinking: { type: "adaptive" },
      messages: [
        {
          role: "user",
          content: `Session title: ${rows[0].title}\nType: ${rows[0].kind}\n\nTranscript:\n${transcript}`,
        },
      ],
    });
  } catch (err) {
    console.error("notes generation failed", err);
    return NextResponse.json(
      { error: "Could not reach Claude. Check ANTHROPIC_API_KEY in .env.local." },
      { status: 503 },
    );
  }

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");

  let notes: MeetingNotes;
  try {
    // The model returns bare JSON; tolerate a stray fence.
    notes = JSON.parse(text.replace(/^```(?:json)?|```$/gm, "").trim());
  } catch {
    return NextResponse.json({ error: "Could not parse the generated notes." }, { status: 502 });
  }

  await sql`update sessions set notes = ${JSON.stringify(notes)}::jsonb where id = ${id}`;
  return NextResponse.json({ notes });
}
