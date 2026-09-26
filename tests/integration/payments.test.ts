import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCheckout, type CheckoutDeps } from "@/lib/booking/checkout";
import { applyPaymentUpdate } from "@/lib/booking/confirm";
import { expireStaleBookings, reconcileBooking } from "@/lib/booking/reconcile";
import { buildStatusView } from "@/lib/booking/status";
import type { DB } from "@/lib/db";
import {
  bookingExceptions,
  bookings,
  couponReservations,
  coupons,
  emailOutbox,
  eventSettings,
  paymentAttempts,
  tickets,
  webhookEvents,
} from "@/lib/db/schema";
import { processEmailOutbox } from "@/lib/email/outbox";
import type { EmailMessage, EmailProvider } from "@/lib/email/provider";
import { handleRazorpayWebhook, retryWebhookBacklog } from "@/lib/payments/webhook";
import { placesInUse } from "@/lib/settings";
import { redeemTicket } from "@/lib/tickets/checkin";
import { createTestDatabase } from "../helpers/db";
import { bookingInput, createUser, expireHoldNow, FakeRazorpay, openSales, RAZORPAY_TEST_MODE } from "../helpers/fixtures";

let db: DB;
let cleanup: () => Promise<void>;
let gateway: FakeRazorpay;
let deps: CheckoutDeps;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDatabase());
});
afterAll(async () => cleanup());

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE bookings, coupons, referral_codes, webhook_events, booking_exceptions, "user" RESTART IDENTITY CASCADE`,
  );
  await db.execute(sql`DELETE FROM event_settings`);
  await openSales(db);
  gateway = new FakeRazorpay();
  deps = { db, gateway, mode: RAZORPAY_TEST_MODE, requireVerifiedEmail: true };
});

async function newCheckout(qty = 2) {
  const u = await createUser(db);
  const girls = Math.ceil(qty / 2);
  const c = await createCheckout(
    deps,
    u.id,
    bookingInput({ quantityTotal: qty, quantityGirls: girls, quantityBoys: qty - girls }),
  );
  return { user: u, checkout: c, orderId: c.order!.id, bookingId: c.bookingId };
}

async function bookingRow(id: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, id));
  return b!;
}

async function ticketCount(bookingId: string) {
  return (await db.select().from(tickets).where(eq(tickets.bookingId, bookingId))).length;
}

describe("confirmation rules", () => {
  it("does not issue passes for an authorised-but-uncaptured payment", async () => {
    const { orderId, bookingId } = await newCheckout();
    const p = gateway.pay(orderId, "authorized");
    const r = await applyPaymentUpdate(db, p, "callback");
    expect(r.outcome).toBe("recorded");
    expect((await bookingRow(bookingId)).status).toBe("pending_payment");
    expect(await ticketCount(bookingId)).toBe(0);
    const view = await buildStatusView(db, await bookingRow(bookingId));
    expect(view.headline).toBe("Payment received; confirming your booking");
  });

  it("shows 'Checking payment status' with no payment evidence (page refresh while pending)", async () => {
    const { bookingId } = await newCheckout();
    const view = await buildStatusView(db, await bookingRow(bookingId));
    expect(view.headline).toBe("Checking payment status");
    expect(view.status).toBe("pending_payment");
  });

  it("confirms a captured payment once and issues one pass per place", async () => {
    const { orderId, bookingId } = await newCheckout(3);
    const p = gateway.pay(orderId, "captured");
    expect((await applyPaymentUpdate(db, p, "callback")).outcome).toBe("confirmed");
    expect((await applyPaymentUpdate(db, p, "webhook")).outcome).toBe("already_confirmed");
    expect(await ticketCount(bookingId)).toBe(3);
    const b = await bookingRow(bookingId);
    expect(b.status).toBe("confirmed");
    expect(b.capturedPaymentId).toBe(p.id);
    const outbox = await db.select().from(emailOutbox).where(eq(emailOutbox.bookingId, bookingId));
    expect(outbox).toHaveLength(1);
  });

  it("creates passes exactly once when callback, webhook and reconcile race", async () => {
    const { orderId, bookingId } = await newCheckout(4);
    const p = gateway.pay(orderId, "captured");
    const results = await Promise.all([
      applyPaymentUpdate(db, p, "callback"),
      applyPaymentUpdate(db, p, "webhook"),
      applyPaymentUpdate(db, p, "reconcile"),
      applyPaymentUpdate(db, p, "webhook"),
    ]);
    expect(results.filter((r) => r.outcome === "confirmed")).toHaveLength(1);
    expect(await ticketCount(bookingId)).toBe(4);
    expect(await db.select().from(paymentAttempts)).toHaveLength(1);
  });

  it("rejects a capture for the wrong amount or currency", async () => {
    const { orderId, bookingId } = await newCheckout();
    const p = gateway.pay(orderId, "captured", { amountPaise: 100 });
    expect((await applyPaymentUpdate(db, p, "webhook")).outcome).toBe("needs_review");
    expect(await ticketCount(bookingId)).toBe(0);
    const [ex] = await db.select().from(bookingExceptions);
    expect(ex!.kind).toBe("amount_mismatch");
  });

  it("never downgrades a confirmed booking on stale failure events", async () => {
    const { orderId, bookingId } = await newCheckout();
    const good = gateway.pay(orderId, "captured");
    await applyPaymentUpdate(db, good, "callback");
    const failedEarlier = gateway.pay(orderId, "failed");
    await applyPaymentUpdate(db, failedEarlier, "webhook");
    // Same payment id replayed with an older status:
    await applyPaymentUpdate(db, { ...good, status: "authorized" }, "webhook");
    expect((await bookingRow(bookingId)).status).toBe("confirmed");
    const [attempt] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.gatewayPaymentId, good.id));
    expect(attempt!.status).toBe("captured");
  });

  it("records an additional captured payment as an exception without new passes", async () => {
    const { orderId, bookingId } = await newCheckout();
    await applyPaymentUpdate(db, gateway.pay(orderId, "captured"), "callback");
    const extra = gateway.pay(orderId, "captured");
    await applyPaymentUpdate(db, extra, "webhook");
    expect(await ticketCount(bookingId)).toBe(2);
    const [ex] = await db.select().from(bookingExceptions).where(eq(bookingExceptions.kind, "extra_capture"));
    expect(ex).toBeDefined();
    const [a] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.gatewayPaymentId, extra.id));
    expect(a!.isExtraCapture).toBe(true);
  });
});

describe("late capture", () => {
  it("confirms after the hold lapsed when capacity is still available", async () => {
    const { orderId, bookingId } = await newCheckout();
    await expireHoldNow(db, bookingId);
    await expireStaleBookings(db, null);
    expect((await bookingRow(bookingId)).status).toBe("expired");
    const r = await applyPaymentUpdate(db, gateway.pay(orderId, "captured"), "webhook");
    expect(r.outcome).toBe("confirmed");
    expect(await ticketCount(bookingId)).toBe(2);
  });

  it("flags paid-needs-review (no passes) if the places were taken meanwhile", async () => {
    await db.update(eventSettings).set({ capacity: 2 }).where(eq(eventSettings.id, "main"));
    const first = await newCheckout(2);
    await expireHoldNow(db, first.bookingId);
    const second = await newCheckout(2); // takes the freed places
    await applyPaymentUpdate(db, gateway.pay(second.orderId, "captured"), "callback");

    const late = await applyPaymentUpdate(db, gateway.pay(first.orderId, "captured"), "webhook");
    expect(late.outcome).toBe("needs_review");
    expect(await ticketCount(first.bookingId)).toBe(0);
    const b = await bookingRow(first.bookingId);
    expect(b.status).toBe("needs_review");
    expect(b.capturedPaymentId).not.toBeNull();
    const [ex] = await db.select().from(bookingExceptions).where(eq(bookingExceptions.bookingId, first.bookingId));
    expect(ex!.kind).toBe("capacity_unavailable_after_capture");
    expect(await placesInUse(db)).toBe(2);
  });

  it("honours a coupon on late capture but flags the over-limit use", async () => {
    await db
      .insert(coupons)
      .values({ code: "ONE", discountType: "percent", percentOff: 10, maxRedemptions: 1, perUserLimit: null });
    const u1 = await createUser(db);
    const c1 = await createCheckout(deps, u1.id, bookingInput({ couponCode: "ONE" }));
    await expireHoldNow(db, c1.bookingId);
    await expireStaleBookings(db, null);
    const u2 = await createUser(db);
    const c2 = await createCheckout(deps, u2.id, bookingInput({ couponCode: "ONE" }));
    await applyPaymentUpdate(db, gateway.pay(c2.order!.id, "captured"), "callback");
    await applyPaymentUpdate(db, gateway.pay(c1.order!.id, "captured"), "webhook");
    expect((await bookingRow(c1.bookingId)).status).toBe("confirmed");
    const [res] = await db.select().from(couponReservations).where(eq(couponReservations.bookingId, c1.bookingId));
    expect(res!.status).toBe("committed");
    expect(res!.overLimit).toBe(true);
    const [ex] = await db.select().from(bookingExceptions).where(eq(bookingExceptions.kind, "coupon_over_limit"));
    expect(ex).toBeDefined();
  });
});

describe("webhooks", () => {
  it("rejects bad signatures without storing anything", async () => {
    const { orderId } = await newCheckout();
    const body = gateway.webhookBody("payment.captured", gateway.pay(orderId, "captured"));
    const res = await handleRazorpayWebhook(db, gateway, body, "0".repeat(64), "evt_1");
    expect(res.status).toBe(401);
    const tampered = await handleRazorpayWebhook(db, gateway, body.replace("INR", "USD"), gateway.signWebhook(body), "evt_1");
    expect(tampered.status).toBe(401);
    expect(await db.select().from(webhookEvents)).toHaveLength(0);
  });

  it("deduplicates repeated deliveries and tolerates out-of-order events", async () => {
    const { orderId, bookingId } = await newCheckout();
    const p = gateway.pay(orderId, "captured");
    const captured = gateway.webhookBody("payment.captured", p);
    const authorizedLate = gateway.webhookBody("payment.authorized", { ...p, status: "authorized" });

    expect((await handleRazorpayWebhook(db, gateway, captured, gateway.signWebhook(captured), "evt_cap")).status).toBe(200);
    const dup = await handleRazorpayWebhook(db, gateway, captured, gateway.signWebhook(captured), "evt_cap");
    expect(dup).toEqual({ status: 200, result: "duplicate" });
    await handleRazorpayWebhook(db, gateway, authorizedLate, gateway.signWebhook(authorizedLate), "evt_auth");

    expect((await bookingRow(bookingId)).status).toBe("confirmed");
    expect(await ticketCount(bookingId)).toBe(2);
    expect(await db.select().from(webhookEvents)).toHaveLength(2);
  });

  it("stores events that fail processing and retries them later", async () => {
    const { orderId, bookingId } = await newCheckout();
    const p = gateway.pay(orderId, "captured");
    await applyPaymentUpdate(db, p, "callback");
    gateway.setStatus(p.id, "refunded", p.amountPaise);
    const body = JSON.stringify({
      event: "refund.processed",
      payload: { refund: { entity: { id: "rfnd_1", payment_id: p.id, amount: p.amountPaise } } },
    });
    gateway.failFetch = true;
    const res = await handleRazorpayWebhook(db, gateway, body, gateway.signWebhook(body), "evt_refund");
    expect(res.status).toBe(500);
    gateway.failFetch = false;
    const retry = await retryWebhookBacklog(db, gateway);
    expect(retry.ok).toBe(1);
    expect((await bookingRow(bookingId)).status).toBe("refunded");
  });
});

describe("reconciliation", () => {
  it("recovers a missed webhook by fetching the order's payments", async () => {
    const { orderId, bookingId } = await newCheckout();
    gateway.pay(orderId, "captured"); // paid, but no callback or webhook arrived
    await reconcileBooking(db, gateway, bookingId);
    expect((await bookingRow(bookingId)).status).toBe("confirmed");
  });

  it("confirms instead of expiring when a capture is found at expiry time", async () => {
    const { orderId, bookingId } = await newCheckout();
    gateway.pay(orderId, "captured");
    await expireHoldNow(db, bookingId);
    const r = await expireStaleBookings(db, gateway);
    expect(r.recovered).toBe(1);
    expect((await bookingRow(bookingId)).status).toBe("confirmed");
  });

  it("gives authorised payments a grace period before expiring", async () => {
    const { orderId, bookingId } = await newCheckout();
    const p = gateway.pay(orderId, "authorized");
    await applyPaymentUpdate(db, p, "webhook");
    await expireHoldNow(db, bookingId);
    await expireStaleBookings(db, gateway);
    expect((await bookingRow(bookingId)).status).toBe("pending_payment");
    await db.execute(sql`UPDATE bookings SET hold_expires_at = now() - interval '2 hours' WHERE id = ${bookingId}`);
    await expireStaleBookings(db, gateway);
    expect((await bookingRow(bookingId)).status).toBe("expired");
  });

  it("does not expire bookings blindly while the gateway is unreachable", async () => {
    const { bookingId } = await newCheckout();
    await expireHoldNow(db, bookingId);
    gateway.failFetch = true;
    await expireStaleBookings(db, gateway);
    expect((await bookingRow(bookingId)).status).toBe("pending_payment");
    expect(await placesInUse(db)).toBe(0); // but the lapsed hold no longer blocks others
  });
});

describe("refunds", () => {
  it("full refunds void passes and block check-in", async () => {
    const { orderId, bookingId } = await newCheckout();
    const p = gateway.pay(orderId, "captured");
    await applyPaymentUpdate(db, p, "callback");
    gateway.setStatus(p.id, "refunded", p.amountPaise);
    const r = await applyPaymentUpdate(db, await gateway.fetchPayment(p.id), "webhook");
    expect(r.outcome).toBe("refunded");
    const ts = await db.select().from(tickets).where(eq(tickets.bookingId, bookingId));
    expect(ts.every((t) => t.status === "void")).toBe(true);
    const staff = await createUser(db, { role: "staff" });
    const res = await redeemTicket(db, { staffUserId: staff.id, ticketId: ts[0]!.id, demoAllowed: false });
    expect(res.state).toBe("void");
  });

  it("partial refunds keep passes but open an exception", async () => {
    const { orderId, bookingId } = await newCheckout();
    const p = gateway.pay(orderId, "captured");
    await applyPaymentUpdate(db, p, "callback");
    gateway.setStatus(p.id, "partially_refunded", 50_000);
    await applyPaymentUpdate(db, await gateway.fetchPayment(p.id), "webhook");
    expect((await bookingRow(bookingId)).status).toBe("confirmed");
    const [ex] = await db.select().from(bookingExceptions).where(eq(bookingExceptions.kind, "partial_refund"));
    expect(ex).toBeDefined();
  });
});

describe("email outbox", () => {
  it("retries after a provider outage without affecting the booking", async () => {
    const { orderId, bookingId } = await newCheckout();
    await applyPaymentUpdate(db, gateway.pay(orderId, "captured"), "callback");
    const sent: EmailMessage[] = [];
    let down = true;
    const provider: EmailProvider = {
      name: "test",
      async send(m) {
        if (down) return { ok: false, error: "503", retryable: true };
        sent.push(m);
        return { ok: true, providerMessageId: "msg_1" };
      },
    };
    const first = await processEmailOutbox(db, { appUrl: "http://localhost:3000", provider });
    expect(first.failed).toBe(1);
    expect((await bookingRow(bookingId)).status).toBe("confirmed");
    down = false;
    await db.execute(sql`UPDATE email_outbox SET next_attempt_at = now()`);
    const second = await processEmailOutbox(db, { appUrl: "http://localhost:3000", provider });
    expect(second.sent).toBe(1);
    expect(sent[0]!.idempotencyKey).toBe(`booking_confirmation:${bookingId}`);
    expect(sent[0]!.text).toContain("Timing to be announced");
    expect(sent[0]!.text).not.toMatch(/alcohol/i);
    const third = await processEmailOutbox(db, { appUrl: "http://localhost:3000", provider });
    expect(third.sent).toBe(0);
  });
});
