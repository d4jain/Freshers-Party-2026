import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { eventSettings, user } from "@/lib/db/schema";
import { hmacSha256Hex } from "@/lib/payments/signature";
import type { CreatedOrder, GatewayPayment, GatewayPaymentStatus, PaymentGateway, PaymentMode } from "@/lib/payments/types";
import { getSettings } from "@/lib/settings";
import type { BookingRequest } from "@/lib/validation";

export const KEY_SECRET = "test_key_secret_abcdefghijklmnop";
export const WEBHOOK_SECRET = "test_webhook_secret_qrstuvwxyz";

export async function createUser(db: DB, opts: { verified?: boolean; role?: "user" | "staff" | "admin"; name?: string } = {}) {
  const id = randomUUID().replace(/-/g, "");
  const email = `user_${id.slice(0, 10)}@example.test`;
  await db.insert(user).values({
    id,
    name: opts.name ?? "Aarav Sharma",
    email,
    emailVerified: opts.verified ?? true,
    phone: "+919876543210",
    role: opts.role ?? "user",
  });
  return { id, email };
}

/** Puts the event into a sellable state for tests. */
export async function openSales(db: DB, patch: Partial<typeof eventSettings.$inferInsert> = {}) {
  await getSettings(db);
  await db
    .update(eventSettings)
    .set({ capacity: 100, salesEnabled: true, policiesApproved: true, ...patch })
    .where(eq(eventSettings.id, "main"));
}

export function bookingInput(overrides: Partial<BookingRequest> = {}): BookingRequest {
  return {
    quantityTotal: 2,
    quantityGirls: 1,
    quantityBoys: 1,
    couponCode: null,
    referralCode: null,
    bookerName: "Aarav Sharma",
    bookerPhone: "+919876543210",
    bookerEmail: "aarav@example.test",
    eligibilityAck: true,
    termsAck: true,
    termsPolicyVersion: 1,
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

export const RAZORPAY_TEST_MODE: PaymentMode = { kind: "razorpay", keyMode: "test" };

type FakePayment = GatewayPayment;

/**
 * In-memory stand-in for Razorpay with the real signature algorithms. Tests
 * drive it to simulate captures, failures, refunds and outages. This is a
 * MOCK — it is not Razorpay test mode.
 */
export class FakeRazorpay implements PaymentGateway {
  readonly provider = "razorpay" as const;
  readonly publicKeyId = "rzp_test_FAKEKEY123";
  readonly isTestMode = true;
  orders = new Map<string, { amountPaise: number; receipt: string }>();
  payments = new Map<string, FakePayment>();
  createOrderCalls = 0;
  failCreateOrder = false;
  failFetch = false;

  async createOrder(input: { amountPaise: number; currency: "INR"; receipt: string }): Promise<CreatedOrder> {
    this.createOrderCalls++;
    await new Promise((r) => setTimeout(r, 5));
    if (this.failCreateOrder) throw new Error("gateway down");
    const id = `order_${randomBytes(7).toString("hex")}`;
    this.orders.set(id, { amountPaise: input.amountPaise, receipt: input.receipt });
    return { id, amountPaise: input.amountPaise, currency: "INR" };
  }

  pay(orderId: string, status: GatewayPaymentStatus, opts: { amountPaise?: number; currency?: string } = {}): FakePayment {
    const order = this.orders.get(orderId);
    const p: FakePayment = {
      id: `pay_${randomBytes(7).toString("hex")}`,
      orderId,
      amountPaise: opts.amountPaise ?? order?.amountPaise ?? 0,
      currency: opts.currency ?? "INR",
      status,
      amountRefundedPaise: 0,
      method: "upi",
      errorCode: status === "failed" ? "BAD_REQUEST_ERROR" : null,
      errorDescription: status === "failed" ? "Payment failed" : null,
      capturedAt: status === "captured" ? new Date() : null,
    };
    this.payments.set(p.id, p);
    return p;
  }

  setStatus(paymentId: string, status: GatewayPaymentStatus, amountRefundedPaise?: number) {
    const p = this.payments.get(paymentId)!;
    p.status = status;
    if (amountRefundedPaise != null) p.amountRefundedPaise = amountRefundedPaise;
    if (status === "captured") p.capturedAt = new Date();
    return p;
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    if (this.failFetch) throw new Error("gateway down");
    const p = this.payments.get(paymentId);
    if (!p) throw new Error("not found");
    return { ...p };
  }

  async fetchOrderPayments(orderId: string): Promise<GatewayPayment[]> {
    if (this.failFetch) throw new Error("gateway down");
    return [...this.payments.values()].filter((p) => p.orderId === orderId).map((p) => ({ ...p }));
  }

  signCheckout(orderId: string, paymentId: string) {
    return hmacSha256Hex(KEY_SECRET, `${orderId}|${paymentId}`);
  }

  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): boolean {
    return this.signCheckout(input.orderId, input.paymentId) === input.signature;
  }

  signWebhook(body: string) {
    return hmacSha256Hex(WEBHOOK_SECRET, body);
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    return this.signWebhook(rawBody) === signature;
  }

  webhookBody(event: string, p: FakePayment, extra: Record<string, unknown> = {}) {
    return JSON.stringify({
      event,
      created_at: Math.floor(Date.now() / 1000),
      payload: {
        payment: {
          entity: {
            id: p.id,
            order_id: p.orderId,
            amount: p.amountPaise,
            currency: p.currency,
            status: p.status === "partially_refunded" ? "captured" : p.status,
            amount_refunded: p.amountRefundedPaise,
            method: p.method,
          },
        },
        ...extra,
      },
    });
  }
}

/** Moves a booking's hold into the past (simulates time passing on the server). */
export async function expireHoldNow(db: DB, bookingId: string) {
  await db.execute(sql`UPDATE inventory_holds SET expires_at = now() - interval '1 minute' WHERE booking_id = ${bookingId}`);
  await db.execute(sql`UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = ${bookingId}`);
  await db.execute(sql`UPDATE coupon_reservations SET expires_at = now() - interval '1 minute' WHERE booking_id = ${bookingId}`);
}
