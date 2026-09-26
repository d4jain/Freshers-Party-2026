import { getDb } from "@/lib/db";
import { background } from "@/lib/deps";
import { processEmailOutbox } from "@/lib/email/outbox";
import { env } from "@/lib/env";
import { getGateway } from "@/lib/payments";
import { handleRazorpayWebhook } from "@/lib/payments/webhook";

export const dynamic = "force-dynamic";

/**
 * Razorpay webhook. Authenticated solely by the HMAC signature over the raw
 * body using RAZORPAY_WEBHOOK_SECRET (separate from the API key secret).
 * Subscribe to: payment.authorized, payment.captured, payment.failed,
 * order.paid, refund.created, refund.processed, refund.failed.
 */
export async function POST(req: Request) {
  const gateway = getGateway();
  if (!gateway || gateway.provider !== "razorpay") {
    return Response.json({ ok: false }, { status: 503 });
  }
  const rawBody = await req.text();
  if (rawBody.length > 512_000) return Response.json({ ok: false }, { status: 413 });

  const db = getDb();
  const outcome = await handleRazorpayWebhook(
    db,
    gateway,
    rawBody,
    req.headers.get("x-razorpay-signature"),
    req.headers.get("x-razorpay-event-id"),
  );
  if (outcome.status === 200 && outcome.result === "processed") {
    background(() => processEmailOutbox(db, { appUrl: env().APP_URL, limit: 5 }));
  }
  return Response.json({ ok: outcome.status === 200, result: outcome.result }, { status: outcome.status });
}
