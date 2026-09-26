import { timingSafeEqual } from "node:crypto";
import { expireStaleBookings } from "@/lib/booking/reconcile";
import type { DB } from "@/lib/db";
import { processEmailOutbox } from "@/lib/email/outbox";
import { pruneRateLimits } from "@/lib/rate-limit";

export function isAuthorizedCron(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !authHeader) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(authHeader);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** One housekeeping pass. Safe to run concurrently and repeatedly. */
export async function runReconciliation(db: DB, appUrl: string) {
  const expiry = await expireStaleBookings(db);
  const email = await processEmailOutbox(db, { appUrl, limit: 25 });
  await pruneRateLimits(db);
  return { expiry, email, ranAt: new Date().toISOString() };
}
