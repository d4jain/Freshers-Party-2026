import { sql } from "drizzle-orm";
import type { Queryable } from "@/lib/db";

export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: Date };

/**
 * Fixed-window limiter stored in Postgres, so it is shared by every
 * serverless instance. One atomic upsert per check; no read-modify-write race.
 */
export async function rateLimit(db: Queryable, key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const res = await db.execute<{ count: number; reset_at: Date }>(sql`
    INSERT INTO app_rate_limits (key, count, reset_at)
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN app_rate_limits.reset_at <= now() THEN 1 ELSE app_rate_limits.count + 1 END,
      reset_at = CASE WHEN app_rate_limits.reset_at <= now()
                      THEN now() + make_interval(secs => ${windowSeconds})
                      ELSE app_rate_limits.reset_at END
    RETURNING count, reset_at
  `);
  const row = res.rows[0]!;
  const count = Number(row.count);
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt: new Date(row.reset_at) };
}

export async function pruneRateLimits(db: Queryable) {
  await db.execute(sql`DELETE FROM app_rate_limits WHERE reset_at < now() - interval '1 day'`);
  await db.execute(
    sql`DELETE FROM rate_limit WHERE last_request < (extract(epoch from now() - interval '1 day') * 1000)::bigint`,
  );
}

/** Client IP for rate-limit keys. Trusts the first X-Forwarded-For hop (set by Vercel/most hosts). */
export function clientIp(headers: Headers, trustProxy = true): string {
  if (trustProxy) {
    const xff = headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim().slice(0, 64);
    const real = headers.get("x-real-ip");
    if (real) return real.trim().slice(0, 64);
  }
  return "unknown";
}
