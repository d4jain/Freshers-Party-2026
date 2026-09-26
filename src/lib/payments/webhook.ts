import { createHash } from "node:crypto";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { applyPaymentUpdate } from "@/lib/booking/confirm";
import type { DB } from "@/lib/db";
import { webhookEvents } from "@/lib/db/schema";
import { mapRazorpayPayment, type RazorpayPaymentEntity } from "./razorpay";
import type { PaymentGateway } from "./types";

type RazorpayWebhookBody = {
  event: string;
  created_at?: number;
  payload?: {
    payment?: { entity: RazorpayPaymentEntity };
    refund?: { entity: { id: string; payment_id: string; amount: number } };
    order?: { entity: { id: string } };
  };
};

export type WebhookOutcome =
  | { status: 200; result: "processed" | "duplicate" | "ignored" }
  | { status: 400 | 401; result: "bad_request" | "bad_signature" }
  | { status: 500; result: "error" };

/** Processes one stored webhook event. Idempotent: safe to run again. */
export async function processWebhookEvent(db: DB, gateway: PaymentGateway, body: RazorpayWebhookBody) {
  const event = body.event;
  switch (event) {
    case "payment.authorized":
    case "payment.captured":
    case "payment.failed":
    case "order.paid": {
      const entity = body.payload?.payment?.entity;
      if (!entity) return "ignored" as const;
      await applyPaymentUpdate(db, mapRazorpayPayment(entity), "webhook");
      return "processed" as const;
    }
    case "refund.created":
    case "refund.processed":
    case "refund.failed":
    case "payment.refunded": {
      const paymentId = body.payload?.refund?.entity.payment_id ?? body.payload?.payment?.entity.id;
      if (!paymentId) return "ignored" as const;
      // The payment entity is the source of truth for cumulative refund amounts.
      const payment = await gateway.fetchPayment(paymentId);
      await applyPaymentUpdate(db, payment, "webhook");
      return "processed" as const;
    }
    default:
      return "ignored" as const;
  }
}

/**
 * Verifies the signature against the *raw* body, stores the event keyed by
 * `x-razorpay-event-id` (deduplication), then processes it. Returns 5xx on
 * processing failure so Razorpay retries; the reconciliation job also picks
 * up unprocessed rows.
 */
export async function handleRazorpayWebhook(
  db: DB,
  gateway: PaymentGateway,
  rawBody: string,
  signature: string | null,
  eventIdHeader: string | null,
): Promise<WebhookOutcome> {
  if (!signature || !gateway.verifyWebhookSignature(rawBody, signature)) {
    return { status: 401, result: "bad_signature" };
  }
  let body: RazorpayWebhookBody;
  try {
    body = JSON.parse(rawBody) as RazorpayWebhookBody;
  } catch {
    return { status: 400, result: "bad_request" };
  }
  if (typeof body.event !== "string") return { status: 400, result: "bad_request" };

  const eventId = eventIdHeader?.slice(0, 128) || `sha256:${createHash("sha256").update(rawBody).digest("hex")}`;

  const inserted = await db
    .insert(webhookEvents)
    .values({ provider: "razorpay", eventId, eventType: body.event, payload: body })
    .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.eventId] })
    .returning({ id: webhookEvents.id });

  let rowId = inserted[0]?.id;
  if (!rowId) {
    const [existing] = await db
      .select()
      .from(webhookEvents)
      .where(and(eq(webhookEvents.provider, "razorpay"), eq(webhookEvents.eventId, eventId)))
      .limit(1);
    if (existing?.processedAt) return { status: 200, result: "duplicate" };
    rowId = existing?.id;
  }

  try {
    const result = await processWebhookEvent(db, gateway, body);
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date(), attempts: sql`${webhookEvents.attempts} + 1`, lastError: null })
      .where(eq(webhookEvents.id, rowId!));
    return { status: 200, result };
  } catch (e) {
    await db
      .update(webhookEvents)
      .set({ attempts: sql`${webhookEvents.attempts} + 1`, lastError: e instanceof Error ? e.message.slice(0, 500) : "error" })
      .where(eq(webhookEvents.id, rowId!));
    return { status: 500, result: "error" };
  }
}

/** Retries stored-but-unprocessed webhook events (e.g. after a DB or gateway outage). */
export async function retryWebhookBacklog(db: DB, gateway: PaymentGateway | null, limit = 50) {
  if (!gateway || gateway.provider !== "razorpay") return { retried: 0 };
  const rows = await db
    .select()
    .from(webhookEvents)
    .where(and(isNull(webhookEvents.processedAt), lt(webhookEvents.attempts, 12)))
    .limit(limit);
  let ok = 0;
  for (const row of rows) {
    try {
      await processWebhookEvent(db, gateway, row.payload as RazorpayWebhookBody);
      await db.update(webhookEvents).set({ processedAt: new Date(), lastError: null }).where(eq(webhookEvents.id, row.id));
      ok++;
    } catch (e) {
      await db
        .update(webhookEvents)
        .set({ attempts: sql`${webhookEvents.attempts} + 1`, lastError: e instanceof Error ? e.message.slice(0, 500) : "error" })
        .where(eq(webhookEvents.id, row.id));
    }
  }
  return { retried: rows.length, ok };
}
