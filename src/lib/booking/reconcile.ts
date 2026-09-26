import { and, asc, eq, lt, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import { logBookingEvent } from "./events";

/**
 * Expires bookings that never submitted payment proof before their hold
 * passed (database time), releasing places and coupon uses. Bookings in
 * review keep their places until an organiser decides. Idempotent.
 */
export async function expireStaleBookings(db: DB, limit = 100) {
  const stale = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.status, "pending_payment"), lt(bookings.holdExpiresAt, sql`now()`)))
    .orderBy(asc(bookings.holdExpiresAt))
    .limit(limit);

  let expired = 0;
  for (const s of stale) {
    const done = await db.transaction(async (tx) => {
      const [b] = await tx.select().from(bookings).where(eq(bookings.id, s.id)).for("update");
      if (!b || b.status !== "pending_payment" || b.holdExpiresAt > new Date()) return false;
      await tx
        .update(bookings)
        .set({ status: "expired", expiredAt: new Date(), statusReason: "Hold expired before payment proof was submitted" })
        .where(eq(bookings.id, b.id));
      await tx.execute(sql`
        UPDATE inventory_holds SET status = 'released', released_at = now(), release_reason = 'expired'
        WHERE booking_id = ${b.id} AND status = 'active'
      `);
      await tx.execute(sql`
        UPDATE coupon_reservations SET status = 'released', released_at = now()
        WHERE booking_id = ${b.id} AND status = 'held'
      `);
      await logBookingEvent(
        tx,
        b.id,
        "pending_payment",
        "expired",
        "reconcile",
        "Hold expired before payment proof was submitted",
      );
      return true;
    });
    if (done) expired++;
  }
  return { checked: stale.length, expired };
}
