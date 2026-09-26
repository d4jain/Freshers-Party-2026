import { isAuthorizedCron, runReconciliation } from "@/lib/cron";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { errorResponse, json } from "@/lib/http";
import { getGateway } from "@/lib/payments";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled reconciliation: expires stale holds (server time), recovers
 * missed webhooks by asking Razorpay, retries stored webhook events and
 * sends queued email. Requires `Authorization: Bearer $CRON_SECRET`
 * (Vercel Cron sends this automatically when CRON_SECRET is set).
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req.headers.get("authorization"), env().CRON_SECRET)) {
    return json({ ok: false }, 401);
  }
  try {
    const summary = await runReconciliation(getDb(), getGateway(), env().APP_URL);
    return json({ ok: true, summary });
  } catch (e) {
    return errorResponse(e);
  }
}
