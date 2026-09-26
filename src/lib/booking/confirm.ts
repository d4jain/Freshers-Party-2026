import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { DB, Tx } from "@/lib/db";
import {
  bookingExceptions,
  bookings,
  couponReservations,
  coupons,
  emailOutbox,
  inventoryHolds,
  paymentAttempts,
  tickets,
  type Booking,
  type PaymentAttempt,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { wasCaptured, type GatewayPayment } from "@/lib/payments/types";
import { effectiveCapacity, lockSettingsForUpdate, placesInUse, type EventSettings } from "@/lib/settings";
import { newManualCode, newPublicId } from "@/lib/tickets/token";
import { logBookingEvent, raiseException, type ExceptionKind } from "./events";

export type PaymentSource = "callback" | "webhook" | "reconcile" | "demo" | "admin_retry";

export type ApplyOutcome =
  "confirmed" | "already_confirmed" | "recorded" | "needs_review" | "refunded" | "unknown_order" | "ignored";

export type ApplyResult = { outcome: ApplyOutcome; bookingId?: string; bookingStatus?: Booking["status"] };

/**
 * Merges a gateway payment into `payment_attempts`. Status only moves
 * forward (created < failed < authorized < captured < partially_refunded <
 * refunded), so late or duplicated events can never downgrade it.
 */
async function upsertAttempt(tx: Tx, booking: Booking, p: GatewayPayment, source: PaymentSource): Promise<PaymentAttempt> {
  const res = await tx.execute(sql`
    INSERT INTO payment_attempts (
      booking_id, provider, gateway_order_id, gateway_payment_id, status, amount_paise, currency,
      amount_refunded_paise, method, error_code, error_description, captured_at, last_source
    ) VALUES (
      ${booking.id}, ${booking.paymentProvider}, ${p.orderId}, ${p.id}, ${p.status}::payment_status, ${p.amountPaise},
      ${p.currency}, ${p.amountRefundedPaise}, ${p.method}, ${p.errorCode}, ${p.errorDescription},
      ${p.capturedAt ? p.capturedAt.toISOString() : null}::timestamptz, ${source}
    )
    ON CONFLICT (gateway_payment_id) DO UPDATE SET
      status = CASE
        WHEN array_position(ARRAY['created','failed','authorized','captured','partially_refunded','refunded']::payment_status[], EXCLUDED.status)
           > array_position(ARRAY['created','failed','authorized','captured','partially_refunded','refunded']::payment_status[], payment_attempts.status)
        THEN EXCLUDED.status ELSE payment_attempts.status END,
      amount_refunded_paise = GREATEST(payment_attempts.amount_refunded_paise, EXCLUDED.amount_refunded_paise),
      method = COALESCE(EXCLUDED.method, payment_attempts.method),
      error_code = COALESCE(payment_attempts.error_code, EXCLUDED.error_code),
      error_description = COALESCE(payment_attempts.error_description, EXCLUDED.error_description),
      captured_at = COALESCE(payment_attempts.captured_at, EXCLUDED.captured_at),
      last_source = EXCLUDED.last_source,
      updated_at = now()
    RETURNING id
  `);
  const id = (res.rows[0] as { id: string }).id;
  const [row] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.id, id));
  return row!;
}

async function moveToNeedsReview(
  tx: Tx,
  booking: Booking,
  attempt: PaymentAttempt,
  kind: ExceptionKind,
  reason: string,
  source: PaymentSource,
  details: Record<string, unknown> = {},
) {
  await tx
    .update(bookings)
    .set({
      status: "needs_review",
      statusReason: reason,
      capturedPaymentId: booking.capturedPaymentId ?? attempt.gatewayPaymentId,
    })
    .where(eq(bookings.id, booking.id));
  await tx
    .update(inventoryHolds)
    .set({ status: "released", releasedAt: new Date(), releaseReason: "needs_review" })
    .where(and(eq(inventoryHolds.bookingId, booking.id), eq(inventoryHolds.status, "active")));
  await raiseException(tx, {
    bookingId: booking.id,
    kind,
    dedupeKey: `${kind}:${attempt.gatewayPaymentId}`,
    details: { paymentId: attempt.gatewayPaymentId, amountPaise: attempt.amountPaise, ...details },
  });
  await logBookingEvent(tx, booking.id, booking.status, "needs_review", source, reason);
}

async function markRefunded(tx: Tx, booking: Booking, attempt: PaymentAttempt, source: PaymentSource) {
  await tx
    .update(bookings)
    .set({
      status: "refunded",
      refundedAt: new Date(),
      statusReason: "Full refund synced from payment provider",
      capturedPaymentId: booking.capturedPaymentId ?? attempt.gatewayPaymentId,
    })
    .where(eq(bookings.id, booking.id));
  await tx
    .update(tickets)
    .set({ status: "void", voidReason: "refunded", voidedAt: new Date() })
    .where(and(eq(tickets.bookingId, booking.id), eq(tickets.status, "valid")));
  await tx
    .update(inventoryHolds)
    .set({ status: "released", releasedAt: new Date(), releaseReason: "refunded" })
    .where(and(eq(inventoryHolds.bookingId, booking.id), eq(inventoryHolds.status, "active")));
  await tx
    .update(couponReservations)
    .set({ status: "released", releasedAt: new Date() })
    .where(and(eq(couponReservations.bookingId, booking.id), eq(couponReservations.status, "held")));
  await tx
    .update(bookingExceptions)
    .set({ resolvedAt: new Date(), resolvedBy: "system", resolutionNote: "Full refund synced from payment provider" })
    .where(and(eq(bookingExceptions.bookingId, booking.id), isNull(bookingExceptions.resolvedAt)));
  await logBookingEvent(tx, booking.id, booking.status, "refunded", source, "Full refund synced; passes voided");
}

async function commitCoupon(tx: Tx, booking: Booking) {
  if (!booking.couponId) return;
  const [coupon] = await tx.select().from(coupons).where(eq(coupons.id, booking.couponId)).for("update");
  const [reservation] = await tx
    .select()
    .from(couponReservations)
    .where(eq(couponReservations.bookingId, booking.id))
    .for("update");
  if (reservation?.status === "committed") return;

  let overLimit = false;
  if (!reservation || reservation.status === "released") {
    // Late capture after the reservation lapsed: the customer already paid the
    // discounted price, so honour it, but flag if limits are now exceeded.
    const usage = await tx.execute<{ total: string; mine: string }>(sql`
      SELECT count(*) AS total, count(*) FILTER (WHERE user_id = ${booking.userId}) AS mine
      FROM coupon_reservations
      WHERE coupon_id = ${booking.couponId} AND booking_id <> ${booking.id}
        AND (status = 'committed' OR (status = 'held' AND expires_at > now()))
    `);
    const total = Number(usage.rows[0]?.total ?? 0);
    const mine = Number(usage.rows[0]?.mine ?? 0);
    overLimit =
      (coupon?.maxRedemptions != null && total >= coupon.maxRedemptions) ||
      (coupon?.perUserLimit != null && mine >= coupon.perUserLimit);
  }

  if (reservation) {
    await tx
      .update(couponReservations)
      .set({ status: "committed", committedAt: new Date(), overLimit })
      .where(eq(couponReservations.id, reservation.id));
  } else {
    await tx.insert(couponReservations).values({
      couponId: booking.couponId,
      bookingId: booking.id,
      userId: booking.userId,
      status: "committed",
      committedAt: new Date(),
      expiresAt: new Date(),
      overLimit,
    });
  }
  if (overLimit) {
    await raiseException(tx, {
      bookingId: booking.id,
      kind: "coupon_over_limit",
      dedupeKey: `coupon_over_limit:${booking.id}`,
      details: { couponCode: booking.couponCode },
    });
  }
}

async function confirmBooking(tx: Tx, booking: Booking, attempt: PaymentAttempt, source: PaymentSource) {
  const [updated] = await tx
    .update(bookings)
    .set({ status: "confirmed", confirmedAt: new Date(), capturedPaymentId: attempt.gatewayPaymentId, statusReason: null })
    .where(and(eq(bookings.id, booking.id), ne(bookings.status, "confirmed")))
    .returning();
  if (!updated) return;

  await tx
    .update(inventoryHolds)
    .set({ status: "consumed", consumedAt: new Date() })
    .where(and(eq(inventoryHolds.bookingId, booking.id), eq(inventoryHolds.status, "active")));

  await commitCoupon(tx, booking);

  // One pass per paid place, created exactly once (unique booking_id + ticket_index).
  const rows = Array.from({ length: booking.quantityTotal }, (_, i) => ({
    bookingId: booking.id,
    userId: booking.userId,
    ticketIndex: i + 1,
    publicId: newPublicId(),
    manualCode: newManualCode(),
    isDemo: booking.isDemo,
  }));
  await tx
    .insert(tickets)
    .values(rows)
    .onConflictDoNothing({ target: [tickets.bookingId, tickets.ticketIndex] });

  await tx
    .insert(emailOutbox)
    .values({
      kind: "booking_confirmation",
      bookingId: booking.id,
      toEmail: booking.bookerEmail,
      dedupeKey: `booking_confirmation:${booking.id}`,
    })
    .onConflictDoNothing({ target: emailOutbox.dedupeKey });

  await logBookingEvent(
    tx,
    booking.id,
    booking.status,
    "confirmed",
    source,
    `Payment ${attempt.gatewayPaymentId} captured; ${booking.quantityTotal} pass(es) issued`,
  );
}

async function holdIsLive(tx: Tx, bookingId: string): Promise<boolean> {
  const res = await tx.execute<{ live: boolean }>(sql`
    SELECT (status = 'active' AND expires_at > now()) AS live FROM inventory_holds WHERE booking_id = ${bookingId}
  `);
  return Boolean(res.rows[0]?.live);
}

async function tryConfirm(
  tx: Tx,
  settings: EventSettings,
  booking: Booking,
  attempt: PaymentAttempt,
  source: PaymentSource,
): Promise<ApplyOutcome> {
  if (
    attempt.amountPaise !== booking.totalPaise ||
    attempt.currency !== "INR" ||
    attempt.gatewayOrderId !== booking.gatewayOrderId
  ) {
    await moveToNeedsReview(
      tx,
      booking,
      attempt,
      "amount_mismatch",
      "Captured amount or currency didn’t match the booking",
      source,
      {
        expectedPaise: booking.totalPaise,
        currency: attempt.currency,
      },
    );
    return "needs_review";
  }
  if (attempt.status === "refunded") {
    await markRefunded(tx, booking, attempt, source);
    return "refunded";
  }
  if (attempt.status === "partially_refunded") {
    await moveToNeedsReview(tx, booking, attempt, "partial_refund", "Partially refunded before confirmation", source);
    return "needs_review";
  }

  let placesOk = await holdIsLive(tx, booking.id);
  if (!placesOk) {
    // Late capture (hold expired or released): recheck capacity under the inventory lock.
    const capacity = effectiveCapacity(settings, booking.isDemo);
    const used = await placesInUse(tx, booking.id);
    placesOk = capacity != null && used + booking.quantityTotal <= capacity;
  }
  if (!placesOk) {
    await moveToNeedsReview(
      tx,
      booking,
      attempt,
      "capacity_unavailable_after_capture",
      "Paid after the hold lapsed and no places were left — organiser must refund or resolve",
      source,
    );
    return "needs_review";
  }
  await confirmBooking(tx, booking, attempt, source);
  return "confirmed";
}

async function handlePrimaryRefundState(
  tx: Tx,
  booking: Booking,
  attempt: PaymentAttempt,
  source: PaymentSource,
): Promise<ApplyOutcome> {
  if (attempt.status === "refunded") {
    await markRefunded(tx, booking, attempt, source);
    return "refunded";
  }
  if (attempt.status === "partially_refunded") {
    await raiseException(tx, {
      bookingId: booking.id,
      kind: "partial_refund",
      dedupeKey: `partial_refund:${attempt.gatewayPaymentId}:${attempt.amountRefundedPaise}`,
      details: { paymentId: attempt.gatewayPaymentId, amountRefundedPaise: attempt.amountRefundedPaise },
    });
    return "recorded";
  }
  return "already_confirmed";
}

/**
 * The single confirmation path shared by the checkout callback, webhooks,
 * reconciliation, demo simulation and organiser retries.
 *
 * Only a *captured* payment for the booking's own order, for exactly the
 * stored amount in INR, can confirm a booking. Ticket creation, hold
 * consumption and coupon commit happen once, inside one transaction that
 * holds the inventory lock and the booking row lock.
 */
export async function applyPaymentUpdate(
  db: DB,
  payment: GatewayPayment,
  source: PaymentSource,
  opts: { expectBookingId?: string } = {},
): Promise<ApplyResult> {
  if (!payment.orderId) return { outcome: "ignored" };

  const [found] = await db.select().from(bookings).where(eq(bookings.gatewayOrderId, payment.orderId)).limit(1);
  if (!found) {
    if (wasCaptured(payment.status)) {
      await raiseException(db, {
        bookingId: null,
        kind: "unknown_order",
        dedupeKey: `unknown_order:${payment.id}`,
        details: { paymentId: payment.id, orderId: payment.orderId, amountPaise: payment.amountPaise },
      });
    }
    return { outcome: "unknown_order" };
  }
  if (opts.expectBookingId && found.id !== opts.expectBookingId) {
    throw new AppError("ORDER_MISMATCH", "This payment doesn’t belong to this booking.", 400);
  }

  return db.transaction(async (tx) => {
    const captured = wasCaptured(payment.status);
    // Lock order everywhere: event_settings (inventory) → booking row.
    const settings = captured ? await lockSettingsForUpdate(tx) : null;
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, found.id)).for("update");
    if (!booking) return { outcome: "ignored" as const };

    const attempt = await upsertAttempt(tx, booking, payment, source);
    const result = (outcome: ApplyOutcome, status?: Booking["status"]): ApplyResult => ({
      outcome,
      bookingId: booking.id,
      bookingStatus: status ?? booking.status,
    });

    if (!wasCaptured(attempt.status)) {
      if (attempt.status === "failed" && payment.status === "failed") {
        await logBookingEvent(tx, booking.id, booking.status, booking.status, source, `Payment attempt ${payment.id} failed`);
      }
      // Failures and authorisations never change booking state.
      return result("recorded");
    }

    const isPrimary = booking.capturedPaymentId === attempt.gatewayPaymentId;

    switch (booking.status) {
      case "confirmed": {
        if (isPrimary) {
          const outcome = await handlePrimaryRefundState(tx, booking, attempt, source);
          return result(outcome, outcome === "refunded" ? "refunded" : "confirmed");
        }
        await tx.update(paymentAttempts).set({ isExtraCapture: true }).where(eq(paymentAttempts.id, attempt.id));
        if (attempt.status === "refunded") {
          await tx
            .update(bookingExceptions)
            .set({ resolvedAt: new Date(), resolvedBy: "system", resolutionNote: "Extra payment refunded" })
            .where(eq(bookingExceptions.dedupeKey, `extra_capture:${attempt.gatewayPaymentId}`));
        } else {
          await raiseException(tx, {
            bookingId: booking.id,
            kind: "extra_capture",
            dedupeKey: `extra_capture:${attempt.gatewayPaymentId}`,
            details: { paymentId: attempt.gatewayPaymentId, amountPaise: attempt.amountPaise },
          });
        }
        return result("recorded");
      }
      case "refunded": {
        if (!isPrimary && attempt.status !== "refunded") {
          await tx.update(paymentAttempts).set({ isExtraCapture: true }).where(eq(paymentAttempts.id, attempt.id));
          await raiseException(tx, {
            bookingId: booking.id,
            kind: "capture_on_refunded_booking",
            dedupeKey: `capture_on_refunded_booking:${attempt.gatewayPaymentId}`,
            details: { paymentId: attempt.gatewayPaymentId },
          });
        }
        return result("recorded");
      }
      case "needs_review": {
        if (attempt.status === "refunded" && (isPrimary || !booking.capturedPaymentId)) {
          await markRefunded(tx, booking, attempt, source);
          return result("refunded", "refunded");
        }
        if (source !== "admin_retry") return result("recorded");
        const outcome = await tryConfirm(tx, settings!, booking, attempt, source);
        return result(outcome, outcome === "confirmed" ? "confirmed" : outcome === "refunded" ? "refunded" : "needs_review");
      }
      case "pending_payment":
      case "expired": {
        const outcome = await tryConfirm(tx, settings!, booking, attempt, source);
        return result(outcome, outcome === "confirmed" ? "confirmed" : outcome === "refunded" ? "refunded" : "needs_review");
      }
    }
  });
}
