import { and, asc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { bookings, paymentAttempts } from "@/lib/db/schema";
import type { PaymentGateway } from "@/lib/payments/types";
import { applyPaymentUpdate, type ApplyResult } from "./confirm";
import { logBookingEvent } from "./events";

/** Extra time a pending booking with an authorised (not yet captured) payment keeps its places. */
export const AUTHORIZED_GRACE_MINUTES = 30;

/**
 * Pulls the order's payments from the gateway and feeds each one through the
 * shared confirmation service. Recovers from missed webhooks and closed tabs.
 */
export async function reconcileBooking(db: DB, gateway: PaymentGateway, bookingId: string): Promise<ApplyResult[]> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking?.gatewayOrderId || booking.paymentProvider !== gateway.provider || gateway.provider === "demo") return [];
  const payments = await gateway.fetchOrderPayments(booking.gatewayOrderId);
  const results: ApplyResult[] = [];
  for (const p of payments) {
    if (p.orderId !== booking.gatewayOrderId) continue;
    results.push(await applyPaymentUpdate(db, p, "reconcile"));
  }
  return results;
}

/**
 * Expires pending bookings whose hold has passed (server/database time),
 * after one last check with the gateway. Bookings with an authorised payment
 * get a short grace period so an in-flight capture isn't orphaned.
 */
export async function expireStaleBookings(db: DB, gateway: PaymentGateway | null, limit = 50) {
  const stale = await db
    .select({ id: bookings.id, provider: bookings.paymentProvider })
    .from(bookings)
    .where(and(eq(bookings.status, "pending_payment"), lt(bookings.holdExpiresAt, sql`now()`)))
    .orderBy(asc(bookings.holdExpiresAt))
    .limit(limit);

  let expired = 0;
  let recovered = 0;
  for (const s of stale) {
    if (gateway && gateway.provider === s.provider) {
      try {
        const res = await reconcileBooking(db, gateway, s.id);
        if (res.some((r) => r.outcome === "confirmed" || r.outcome === "needs_review")) {
          recovered++;
          continue;
        }
      } catch {
        // Gateway unreachable: don't expire blindly while we can't see payment state.
        continue;
      }
    }
    const didExpire = await db.transaction(async (tx) => {
      const [b] = await tx.select().from(bookings).where(eq(bookings.id, s.id)).for("update");
      if (!b || b.status !== "pending_payment") return false;
      const graceCheck = await tx.execute<{ in_grace: boolean; expired: boolean }>(sql`
        SELECT
          EXISTS (
            SELECT 1 FROM payment_attempts
            WHERE booking_id = ${b.id} AND status = 'authorized'
          ) AND now() < hold_expires_at + make_interval(mins => ${AUTHORIZED_GRACE_MINUTES}) AS in_grace,
          (hold_expires_at <= now()) AS expired
        FROM bookings WHERE id = ${b.id}
      `);
      const row = graceCheck.rows[0];
      if (!row?.expired || row.in_grace) return false;
      await tx
        .update(bookings)
        .set({ status: "expired", expiredAt: new Date(), statusReason: "Hold expired without a captured payment" })
        .where(eq(bookings.id, b.id));
      await tx.execute(sql`
        UPDATE inventory_holds SET status = 'released', released_at = now(), release_reason = 'expired'
        WHERE booking_id = ${b.id} AND status = 'active'
      `);
      await tx.execute(sql`
        UPDATE coupon_reservations SET status = 'released', released_at = now()
        WHERE booking_id = ${b.id} AND status = 'held'
      `);
      await logBookingEvent(tx, b.id, "pending_payment", "expired", "reconcile", "Hold expired without a captured payment");
      return true;
    });
    if (didExpire) expired++;
  }
  return { checked: stale.length, expired, recovered };
}

/**
 * Re-checks recent bookings that already have payment evidence but aren't
 * settled (e.g. authorised payments awaiting capture).
 */
export async function reconcileAuthorizedPayments(db: DB, gateway: PaymentGateway | null, limit = 50) {
  if (!gateway || gateway.provider === "demo") return { checked: 0 };
  const rows = await db
    .selectDistinct({ bookingId: paymentAttempts.bookingId })
    .from(paymentAttempts)
    .innerJoin(bookings, eq(bookings.id, paymentAttempts.bookingId))
    .where(
      and(
        eq(paymentAttempts.status, "authorized"),
        inArray(bookings.status, ["pending_payment", "expired"]),
        isNotNull(bookings.gatewayOrderId),
      ),
    )
    .limit(limit);
  for (const r of rows) {
    try {
      await reconcileBooking(db, gateway, r.bookingId);
    } catch {
      /* retried next run */
    }
  }
  return { checked: rows.length };
}
