import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { createSessionCookie, verifyPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password } = await req.json();

  const rows = await sql`
    select id, password_hash from users where email = ${String(email ?? "").toLowerCase()}
  `;
  const user = rows[0];

  if (!user || !(await verifyPassword(String(password ?? ""), user.password_hash as string))) {
    return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });
  }

  await createSessionCookie(user.id as string);
  return NextResponse.json({ ok: true });
}
