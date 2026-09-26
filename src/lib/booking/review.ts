import { and, eq, inArray, sql } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";
import type { DB, Tx } from "@/lib/db";
import { bookings, couponReservations, emailOutbox, inventoryHolds, tickets, type Booking } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { effectiveCapacity, lockSettingsForUpdate, placesInUse } from "@/lib/settings";
import { newManualCode, newPublicId } from "@/lib/tickets/token";
import { logBookingEvent } from "./events";

async function enqueueEmail(tx: Tx, booking: Booking, kind: string) {
  await tx
    .insert(emailOutbox)
    .values({ kind, bookingId: booking.id, toEmail: booking.bookerEmail, dedupeKey: `${kind}:${booking.id}` })
    .onConflictDoNothing({ target: emailOutbox.dedupeKey });
}

/**
 * Organiser approves a booking after checking the payment proof against their
 * UPI account. This is the ONLY path that confirms a booking and issues
 * passes. Runs once: the booking row lock + status check + unique
 * (booking_id, ticket_index) make concurrent approvals safe.
 */
export async function approveBooking(db: DB, opts: { adminId: string; bookingId: string; note?: string | null }) {
  const result = await db.transaction(async (tx) => {
    const settings = await lockSettingsForUpdate(tx);
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, opts.bookingId)).for("update");
    if (!booking) throw new AppError("NOT_FOUND", "Booking not found.", 404);
    if (booking.status === "confirmed") return { outcome: "already_confirmed" as const, booking };
    if (booking.status !== "in_review") {
      throw new AppError("NOT_IN_REVIEW", "Only bookings with submitted payment proof can be approved.", 409);
    }

    const hold = await tx.execute<{ live: boolean }>(sql`
      SELECT (status = 'active' AND expires_at > now()) AS live FROM inventory_holds WHERE booking_id = ${booking.id}
    `);
    if (!hold.rows[0]?.live) {
      const capacity = effectiveCapacity(settings, booking.isDemo);
      const used = await placesInUse(tx, booking.id);
      if (capacity == null || used + booking.quantityTotal > capacity) {
        throw new AppError(
          "NO_PLACES",
          "Not enough places left to confirm this booking. Reject it (and refund) or raise capacity.",
          409,
        );
      }
    }

    const now = new Date();
    const [confirmed] = await tx
      .update(bookings)
      .set({ status: "confirmed", confirmedAt: now, reviewedAt: now, reviewedBy: opts.adminId, reviewNote: opts.note ?? null })
      .where(and(eq(bookings.id, booking.id), eq(bookings.status, "in_review")))
      .returning();
    await tx
      .update(inventoryHolds)
      .set({ status: "consumed", consumedAt: now })
      .where(and(eq(inventoryHolds.bookingId, booking.id), eq(inventoryHolds.status, "active")));
    await tx
      .update(couponReservations)
      .set({ status: "committed", committedAt: now })
      .where(and(eq(couponReservations.bookingId, booking.id), eq(couponReservations.status, "held")));

    // One pass per paid place, created exactly once.
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
    await enqueueEmail(tx, booking, "booking_confirmation");
    await logBookingEvent(
      tx,
      booking.id,
      "in_review",
      "confirmed",
      "organiser",
      `Payment verified; ${booking.quantityTotal} pass(es) issued`,
    );
    await recordAudit(tx, {
      actorUserId: opts.adminId,
      action: "booking.approve",
      targetType: "booking",
      targetId: booking.id,
      details: { reference: booking.reference, totalPaise: booking.totalPaise, note: opts.note ?? null },
    });
    return { outcome: "confirmed" as const, booking: confirmed! };
  });
  return result;
}

/** Organiser rejects the proof (e.g. payment not received). Places and coupon use are released. */
export async function rejectBooking(db: DB, opts: { adminId: string; bookingId: string; reason: string }) {
  const reason = opts.reason.trim();
  if (reason.length < 5) throw new AppError("REASON_REQUIRED", "Give the buyer a short reason.", 400);
  return db.transaction(async (tx) => {
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, opts.bookingId)).for("update");
    if (!booking) throw new AppError("NOT_FOUND", "Booking not found.", 404);
    if (booking.status !== "in_review" && booking.status !== "pending_payment") {
      throw new AppError("NOT_REJECTABLE", "Only bookings awaiting payment or in review can be rejected.", 409);
    }
    const now = new Date();
    await tx
      .update(bookings)
      .set({ status: "rejected", reviewedAt: now, reviewedBy: opts.adminId, reviewNote: reason.slice(0, 500) })
      .where(eq(bookings.id, booking.id));
    await tx
      .update(inventoryHolds)
      .set({ status: "released", releasedAt: now, releaseReason: "rejected" })
      .where(and(eq(inventoryHolds.bookingId, booking.id), eq(inventoryHolds.status, "active")));
    await tx
      .update(couponReservations)
      .set({ status: "released", releasedAt: now })
      .where(and(eq(couponReservations.bookingId, booking.id), eq(couponReservations.status, "held")));
    await enqueueEmail(tx, booking, "booking_rejected");
    await logBookingEvent(tx, booking.id, booking.status, "rejected", "organiser", reason);
    await recordAudit(tx, {
      actorUserId: opts.adminId,
      action: "booking.reject",
      targetType: "booking",
      targetId: booking.id,
      details: { reference: booking.reference, reason },
    });
    return { outcome: "rejected" as const };
  });
}

/**
 * Organiser cancels a confirmed booking (e.g. after refunding it manually).
 * All passes are voided and rejected at the door.
 */
export async function cancelBooking(db: DB, opts: { adminId: string; bookingId: string; reason: string }) {
  const reason = opts.reason.trim();
  if (reason.length < 5) throw new AppError("REASON_REQUIRED", "Give a short reason.", 400);
  return db.transaction(async (tx) => {
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, opts.bookingId)).for("update");
    if (!booking) throw new AppError("NOT_FOUND", "Booking not found.", 404);
    if (booking.status !== "confirmed") throw new AppError("NOT_CANCELLABLE", "Only confirmed bookings can be cancelled.", 409);
    const now = new Date();
    await tx
      .update(bookings)
      .set({ status: "cancelled", cancelledAt: now, reviewNote: reason.slice(0, 500) })
      .where(eq(bookings.id, booking.id));
    await tx
      .update(tickets)
      .set({ status: "void", voidReason: "booking cancelled", voidedAt: now })
      .where(and(eq(tickets.bookingId, booking.id), inArray(tickets.status, ["valid"])));
    await enqueueEmail(tx, booking, "booking_cancelled");
    await logBookingEvent(tx, booking.id, "confirmed", "cancelled", "organiser", reason);
    await recordAudit(tx, {
      actorUserId: opts.adminId,
      action: "booking.cancel",
      targetType: "booking",
      targetId: booking.id,
      details: { reference: booking.reference, reason },
    });
    return { outcome: "cancelled" as const };
  });
}
