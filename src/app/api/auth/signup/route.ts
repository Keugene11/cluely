import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { createSessionCookie, hashPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password, name } = await req.json();

  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = await sql`select id from users where email = ${email.toLowerCase()}`;
  if (existing.length > 0) {
    return NextResponse.json({ error: "That email already has an account." }, { status: 409 });
  }

  const rows = await sql`
    insert into users (email, name, password_hash)
    values (${email.toLowerCase()}, ${String(name ?? "").trim()}, ${await hashPassword(password)})
    returning id
  `;

  await createSessionCookie(rows[0].id as string);
  return NextResponse.json({ ok: true });
}
