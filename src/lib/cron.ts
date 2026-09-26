import { timingSafeEqual } from "node:crypto";
import { expireStaleBookings, reconcileAuthorizedPayments } from "@/lib/booking/reconcile";
import type { DB } from "@/lib/db";
import { processEmailOutbox } from "@/lib/email/outbox";
import type { PaymentGateway } from "@/lib/payments/types";
import { retryWebhookBacklog } from "@/lib/payments/webhook";
import { pruneRateLimits } from "@/lib/rate-limit";

export function isAuthorizedCron(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !authHeader) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(authHeader);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** One reconciliation pass. Safe to run concurrently and repeatedly. */
export async function runReconciliation(db: DB, gateway: PaymentGateway | null, appUrl: string) {
  const expiry = await expireStaleBookings(db, gateway);
  const authorized = await reconcileAuthorizedPayments(db, gateway);
  const webhooks = await retryWebhookBacklog(db, gateway);
  const email = await processEmailOutbox(db, { appUrl, limit: 25 });
  await pruneRateLimits(db);
  return { expiry, authorized, webhooks, email, ranAt: new Date().toISOString() };
}
