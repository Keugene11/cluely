import { sql } from "@/lib/db";

/**
 * What the public demo is allowed to cost.
 *
 * The demo answers without an account so someone can try the product from a
 * portfolio page instead of reading about it. That also means an open door in
 * front of a paid API, so the door has a budget rather than a lock: enough
 * turns for a real conversation, few enough that nobody can run a chatbot on
 * someone else's key.
 *
 * The global ceiling is the one that matters. A per-IP limit alone is a limit
 * on politeness — addresses are free — so it exists to keep one visitor from
 * eating the hour, while the global number is what actually caps the bill.
 */
export const DEMO_PER_IP_HOURLY = 15;
export const DEMO_GLOBAL_HOURLY = 400;

/** Longest question the demo will forward, in characters. */
export const DEMO_MAX_QUESTION = 2000;

/** Largest screenshot the demo will forward, in base64 characters (~1.5MB). */
export const DEMO_MAX_IMAGE = 2_000_000;

export type Quota = { ok: true } | { ok: false; message: string };

/**
 * Who to count this request against.
 *
 * `x-forwarded-for` is a list when proxies chain; the client is the first
 * entry. Vercel sets it, and nothing else in front of this is trusted, so a
 * spoofed header only lets someone share a bucket with a stranger — it cannot
 * lift the global ceiling, which is the number that protects the key.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}

/**
 * Whether this demo ask is within budget, and the record that it happened.
 *
 * Counted before the Claude call rather than after: a request that streams for
 * thirty seconds has already been paid for by the time it finishes, so waiting
 * for the end to count it would let a burst through the gate together.
 */
export async function takeDemoQuota(ip: string): Promise<Quota> {
  try {
    const [counts] = await sql`
      select
        count(*) filter (where ip = ${ip}) as mine,
        count(*) as everyone
      from demo_asks
      where created_at > now() - interval '1 hour'
    `;

    if (Number(counts?.mine ?? 0) >= DEMO_PER_IP_HOURLY) {
      return {
        ok: false,
        message: `That is ${DEMO_PER_IP_HOURLY} questions in an hour — the demo's limit. It resets within the hour, or you can run the real thing from the download page.`,
      };
    }

    if (Number(counts?.everyone ?? 0) >= DEMO_GLOBAL_HOURLY) {
      return {
        ok: false,
        message: "The demo is busier than usual right now. Try again in a few minutes.",
      };
    }

    await sql`insert into demo_asks (ip) values (${ip})`;
    return { ok: true };
  } catch {
    // The limiter is the only thing standing in front of a paid API, so a
    // database it cannot reach means the demo is closed, not that it is free.
    return {
      ok: false,
      message: "The demo is unavailable right now. Try again shortly.",
    };
  }
}

/**
 * Drop demo rows nothing will ever count again.
 *
 * Called opportunistically from the demo path — the table only exists to
 * answer "how many in the last hour", so anything older is dead weight, and a
 * public endpoint is exactly the kind of thing that would otherwise grow a
 * table forever.
 */
export async function sweepDemoAsks(): Promise<void> {
  await sql`delete from demo_asks where created_at < now() - interval '2 hours'`.catch(() => {});
}
