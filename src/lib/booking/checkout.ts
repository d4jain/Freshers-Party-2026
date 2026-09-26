import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ELIGIBILITY_ACK_TEXT, ELIGIBILITY_ACK_VERSION } from "@/config/event";
import { generateBookingReference } from "@/lib/codes";
import type { DB, Tx } from "@/lib/db";
import {
  bookings,
  couponReservations,
  coupons,
  inventoryHolds,
  referralCodes,
  user as userTable,
  type Booking,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import type { PaymentGateway, PaymentMode } from "@/lib/payments/types";
import { priceBooking, type PriceBreakdown } from "@/lib/pricing";
import { evaluateSales, lockSettingsForUpdate, placesInUse } from "@/lib/settings";
import type { BookingRequest } from "@/lib/validation";
import { logBookingEvent } from "./events";

export type CheckoutDeps = {
  db: DB;
  gateway: PaymentGateway | null;
  mode: PaymentMode;
  requireVerifiedEmail: boolean;
  now?: () => Date;
};

export type CheckoutPayload = {
  bookingId: string;
  reference: string;
  status: Booking["status"];
  provider: "razorpay" | "demo";
  isDemo: boolean;
  reused: boolean;
  keyId: string | null;
  order: { id: string; amountPaise: number; currency: "INR" } | null;
  holdExpiresAt: string;
  breakdown: PriceBreakdown;
  prefill: { name: string; email: string; contact: string };
};

function fingerprint(parts: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/** Releases a pending booking's hold and coupon reservation; the booking becomes `expired`. */
export async function releasePendingBooking(tx: Tx, booking: Booking, source: string, reason: string) {
  await tx
    .update(bookings)
    .set({ status: "expired", expiredAt: new Date(), statusReason: reason })
    .where(and(eq(bookings.id, booking.id), eq(bookings.status, "pending_payment")));
  await tx
    .update(inventoryHolds)
    .set({ status: "released", releasedAt: new Date(), releaseReason: reason })
    .where(and(eq(inventoryHolds.bookingId, booking.id), eq(inventoryHolds.status, "active")));
  await tx
    .update(couponReservations)
    .set({ status: "released", releasedAt: new Date() })
    .where(and(eq(couponReservations.bookingId, booking.id), eq(couponReservations.status, "held")));
  await logBookingEvent(tx, booking.id, "pending_payment", "expired", source, reason);
}

/**
 * Steps 1–2 of the payment flow: validate everything server-side, then
 * atomically reserve places (and a coupon use) and create a pending booking.
 * Idempotent per (user, idempotencyKey). No network calls inside the
 * transaction.
 */
export async function reserveBooking(
  deps: CheckoutDeps,
  userId: string,
  input: BookingRequest,
): Promise<{ booking: Booking; breakdown: PriceBreakdown; reused: boolean }> {
  const { db, mode } = deps;
  const now = deps.now?.() ?? new Date();

  const [account] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);
  if (!account) throw new AppError("UNAUTHENTICATED", "Please log in again.", 401);
  if (deps.requireVerifiedEmail && !account.emailVerified) {
    throw new AppError("EMAIL_NOT_VERIFIED", "Please verify your email address before booking.", 403);
  }
  if (!deps.gateway || mode.kind === "disabled") {
    throw new AppError(
      "PAYMENTS_DISABLED",
      mode.kind === "disabled" ? mode.reason : "Online checkout isn’t available.",
      503,
      mode.kind === "disabled" ? { setupHint: mode.setupHint } : undefined,
    );
  }
  const provider = deps.gateway.provider;

  return db.transaction(async (tx) => {
    const settings = await lockSettingsForUpdate(tx);

    // Idempotent replay: the same intent always maps to the same booking.
    const [existing] = await tx
      .select()
      .from(bookings)
      .where(and(eq(bookings.userId, userId), eq(bookings.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (existing) {
      return { booking: existing, breakdown: existing.pricingSnapshot as PriceBreakdown, reused: true };
    }

    const sales = evaluateSales(settings, mode, now);
    if (!sales.open) {
      throw new AppError("SALES_CLOSED", sales.reason, 409, { salesCode: sales.code, setupHint: sales.setupHint });
    }
    if (input.quantityTotal > settings.maxGroupSize) {
      throw new AppError("GROUP_TOO_LARGE", `You can book up to ${settings.maxGroupSize} people in one booking.`, 400);
    }
    if (input.termsPolicyVersion !== settings.policyVersion) {
      throw new AppError("POLICY_CHANGED", "The event terms were updated. Please review and accept them again.", 409, {
        policyVersion: settings.policyVersion,
      });
    }

    // Referral attribution (never a discount). Booking-form code wins over signup code.
    let referral: { id: string; code: string; source: "booking_form" | "signup" } | null = null;
    if (input.referralCode) {
      const [ref] = await tx.select().from(referralCodes).where(eq(referralCodes.code, input.referralCode)).limit(1);
      if (!ref || !ref.active) throw new AppError("REFERRAL_NOT_FOUND", "That referral code isn’t recognised.", 400);
      if (ref.ownerUserId === userId) {
        throw new AppError("SELF_REFERRAL", "You can’t use your own referral code.", 400);
      }
      referral = { id: ref.id, code: ref.code, source: "booking_form" };
    } else if (account.signupReferralCodeId && account.signupReferralCode) {
      referral = { id: account.signupReferralCodeId, code: account.signupReferralCode, source: "signup" };
    }

    // Coupon row lock serialises concurrent redemptions of the same coupon.
    let coupon: typeof coupons.$inferSelect | null = null;
    if (input.couponCode) {
      const [c] = await tx.select().from(coupons).where(eq(coupons.code, input.couponCode)).for("update");
      if (!c) throw new AppError("COUPON_NOT_FOUND", "That coupon code isn’t valid.", 400);
      coupon = c;
    }

    const priced = priceBooking({
      quantity: input.quantityTotal,
      unitPricePaise: settings.unitPricePaise,
      compareAtPricePaise: settings.compareAtPricePaise,
      bookingFeePaise: settings.bookingFeePaise,
      bookingFeeLabel: settings.bookingFeeLabel,
      coupon,
      now,
    });
    if (!priced.ok) throw new AppError(priced.code, priced.message, 400);
    const breakdown = priced.breakdown;

    const requestFingerprint = fingerprint({
      q: [input.quantityTotal, input.quantityGirls, input.quantityBoys],
      coupon: coupon?.code ?? null,
      referral: referral?.code ?? null,
      booker: [input.bookerName, input.bookerPhone, input.bookerEmail],
      price: [breakdown.unitPricePaise, breakdown.feesPaise, breakdown.totalPaise],
      policy: settings.policyVersion,
      provider,
    });

    // One pending booking per user: reuse it if identical and still held, else supersede it.
    const [pending] = await tx
      .select()
      .from(bookings)
      .where(and(eq(bookings.userId, userId), eq(bookings.status, "pending_payment")))
      .for("update");
    if (pending) {
      const live = await tx.execute<{ live: boolean }>(sql`
        SELECT (status = 'active' AND expires_at > now()) AS live FROM inventory_holds WHERE booking_id = ${pending.id}
      `);
      const holdLive = Boolean(live.rows[0]?.live);
      if (pending.requestFingerprint === requestFingerprint && holdLive) {
        return { booking: pending, breakdown: pending.pricingSnapshot as PriceBreakdown, reused: true };
      }
      await releasePendingBooking(tx, pending, "checkout", "Superseded by a newer booking request");
    }

    if (coupon) {
      const usage = await tx.execute<{ total: string; mine: string }>(sql`
        SELECT count(*) AS total, count(*) FILTER (WHERE user_id = ${userId}) AS mine
        FROM coupon_reservations
        WHERE coupon_id = ${coupon.id}
          AND (status = 'committed' OR (status = 'held' AND expires_at > now()))
      `);
      const total = Number(usage.rows[0]?.total ?? 0);
      const mine = Number(usage.rows[0]?.mine ?? 0);
      if (coupon.maxRedemptions != null && total >= coupon.maxRedemptions) {
        throw new AppError("COUPON_EXHAUSTED", "This coupon has been fully used.", 409);
      }
      if (coupon.perUserLimit != null && mine >= coupon.perUserLimit) {
        throw new AppError("COUPON_USER_LIMIT", "You’ve already used this coupon.", 409);
      }
    }

    const used = await placesInUse(tx);
    if (used + input.quantityTotal > sales.capacity) {
      throw new AppError(
        "NOT_ENOUGH_PLACES",
        used >= sales.capacity
          ? "Sorry — every place is currently booked or on hold."
          : "There aren’t enough places left for a group this size.",
        409,
      );
    }

    const [booking] = await tx
      .insert(bookings)
      .values({
        reference: generateBookingReference((n) => randomBytes(n)),
        userId,
        status: "pending_payment",
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
        quantityTotal: input.quantityTotal,
        quantityGirls: input.quantityGirls,
        quantityBoys: input.quantityBoys,
        currency: "INR",
        unitPricePaise: breakdown.unitPricePaise,
        compareAtPricePaise: breakdown.compareAtPricePaise,
        subtotalPaise: breakdown.subtotalPaise,
        discountPaise: breakdown.discountPaise,
        feesPaise: breakdown.feesPaise,
        totalPaise: breakdown.totalPaise,
        pricingSnapshot: breakdown,
        settingsVersion: settings.version,
        couponId: coupon?.id ?? null,
        couponCode: coupon?.code ?? null,
        referralCodeId: referral?.id ?? null,
        referralCode: referral?.code ?? null,
        referralSource: referral?.source ?? null,
        bookerName: input.bookerName,
        bookerPhone: input.bookerPhone,
        bookerEmail: input.bookerEmail,
        eligibilityAckAt: now,
        eligibilityAckVersion: ELIGIBILITY_ACK_VERSION,
        eligibilityAckText: ELIGIBILITY_ACK_TEXT,
        termsAckAt: now,
        termsAckPolicyVersion: settings.policyVersion,
        paymentProvider: provider,
        isDemo: provider === "demo",
        holdExpiresAt: sql`now() + make_interval(mins => ${settings.holdMinutes})` as unknown as Date,
      })
      .returning();

    await tx.insert(inventoryHolds).values({
      bookingId: booking!.id,
      quantity: booking!.quantityTotal,
      expiresAt: booking!.holdExpiresAt,
    });
    if (coupon) {
      await tx.insert(couponReservations).values({
        couponId: coupon.id,
        bookingId: booking!.id,
        userId,
        expiresAt: booking!.holdExpiresAt,
      });
    }
    await logBookingEvent(
      tx,
      booking!.id,
      null,
      "pending_payment",
      "checkout",
      `Places held for ${settings.holdMinutes} minutes`,
    );
    return { booking: booking!, breakdown, reused: false };
  });
}

/**
 * Step 3: make sure the pending booking has exactly one gateway order for
 * its stored amount. Runs after the reservation transaction commits.
 * Compare-and-set keeps a single order id even under concurrent retries; a
 * losing order is never shown to the browser and cannot be paid.
 */
export async function ensureGatewayOrder(db: DB, gateway: PaymentGateway, booking: Booking): Promise<Booking> {
  if (booking.gatewayOrderId || booking.status !== "pending_payment") return booking;
  if (booking.paymentProvider !== gateway.provider) {
    throw new AppError("PROVIDER_CHANGED", "Payment settings changed. Please start your booking again.", 409);
  }
  let order;
  try {
    order = await gateway.createOrder({
      amountPaise: booking.totalPaise,
      currency: "INR",
      receipt: booking.reference,
      notes: { booking_id: booking.id, reference: booking.reference },
    });
  } catch {
    throw new AppError(
      "GATEWAY_UNAVAILABLE",
      "We couldn’t reach the payment provider. Your places are still held — please try again.",
      502,
    );
  }
  if (order.amountPaise !== booking.totalPaise || order.currency !== "INR") {
    throw new AppError("GATEWAY_MISMATCH", "The payment order didn’t match your booking. Please try again.", 502);
  }
  const [updated] = await db
    .update(bookings)
    .set({ gatewayOrderId: order.id, gatewayOrderCreatedAt: new Date() })
    .where(and(eq(bookings.id, booking.id), isNull(bookings.gatewayOrderId)))
    .returning();
  if (updated) return updated;
  const [current] = await db.select().from(bookings).where(eq(bookings.id, booking.id)).limit(1);
  return current!;
}

export async function createCheckout(deps: CheckoutDeps, userId: string, input: BookingRequest): Promise<CheckoutPayload> {
  const { booking: reserved, breakdown, reused } = await reserveBooking(deps, userId, input);
  const gateway = deps.gateway!;

  if (reserved.status === "pending_payment" && reserved.holdExpiresAt <= (deps.now?.() ?? new Date())) {
    throw new AppError("HOLD_EXPIRED", "Your held places expired. Please start a new booking.", 409, {
      bookingId: reserved.id,
    });
  }

  const booking = await ensureGatewayOrder(deps.db, gateway, reserved);
  const payable = booking.status === "pending_payment" && booking.gatewayOrderId;

  return {
    bookingId: booking.id,
    reference: booking.reference,
    status: booking.status,
    provider: booking.paymentProvider as "razorpay" | "demo",
    isDemo: booking.isDemo,
    reused,
    keyId: gateway.publicKeyId,
    order: payable ? { id: booking.gatewayOrderId!, amountPaise: booking.totalPaise, currency: "INR" } : null,
    holdExpiresAt: booking.holdExpiresAt.toISOString(),
    breakdown,
    prefill: { name: booking.bookerName, email: booking.bookerEmail, contact: booking.bookerPhone },
  };
}
