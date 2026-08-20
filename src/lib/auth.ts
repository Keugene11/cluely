import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { sql, type User } from "./db";

const COOKIE = "cluely_session";
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-only-insecure-secret-change-me",
);

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSessionCookie(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/**
 * Development escape hatch: skip the login wall and run as the first account in
 * the database.
 *
 * Deliberately needs BOTH a non-production build and an explicit opt-in env var,
 * so it cannot be turned on by a stray environment variable in prod or by
 * forgetting to unset one locally. It returns a real row rather than a stub
 * because a fabricated id would break anything that keys off the user.
 */
async function devBypassUser(): Promise<User | null> {
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.DEV_AUTH_BYPASS !== "1") return null;
  const rows = (await sql`
    select id, email, name, plan, created_at from users order by created_at limit 1
  `) as User[];
  return rows[0] ?? null;
}

/** Returns the signed-in user, or null. */
export async function getUser(): Promise<User | null> {
  const bypass = await devBypassUser();
  if (bypass) return bypass;

  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    const rows = (await sql`
      select id, email, name, plan, created_at from users where id = ${payload.sub as string}
    `) as User[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Same as getUser but throws a 401-shaped error for route handlers. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}
