import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUser } from "@/lib/auth";

const STARTER_FILE_LIMIT = 3;

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const files = await sql`
    select id, name, content, created_at from context_files
    where user_id = ${user.id} order by created_at desc
  `;
  return NextResponse.json({ files });
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, content } = await req.json();
  if (!String(content ?? "").trim()) {
    return NextResponse.json({ error: "The file is empty." }, { status: 400 });
  }

  if (user.plan === "starter") {
    const [{ count }] = (await sql`
      select count(*)::int as count from context_files where user_id = ${user.id}
    `) as { count: number }[];
    if (count >= STARTER_FILE_LIMIT) {
      return NextResponse.json(
        { error: `Starter is capped at ${STARTER_FILE_LIMIT} context files. Upgrade to Pro for unlimited.` },
        { status: 402 },
      );
    }
  }

  const rows = await sql`
    insert into context_files (user_id, name, content)
    values (${user.id}, ${String(name || "Untitled").slice(0, 200)}, ${String(content).slice(0, 100000)})
    returning id, name, content, created_at
  `;
  return NextResponse.json({ file: rows[0] });
}
