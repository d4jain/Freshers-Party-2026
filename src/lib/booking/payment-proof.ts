import { createHash } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import sharp from "sharp";
import type { DB } from "@/lib/db";
import { bookings, couponReservations, emailOutbox, inventoryHolds, paymentProofs } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { normalizeUtr } from "@/lib/payments/upi";
import { effectiveCapacity, eventEndsAt, lockSettingsForUpdate, placesInUse } from "@/lib/settings";
import { logBookingEvent } from "./events";

export const MAX_PROOF_BYTES = 8 * 1024 * 1024;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "heif", "avif"]);

/**
 * Decodes the upload as a real image (rejects anything else), fixes rotation,
 * strips metadata (EXIF/GPS) and re-encodes a bounded JPEG for storage.
 */
export async function processProofImage(input: Buffer): Promise<{ image: Buffer; contentType: "image/jpeg" }> {
  if (input.length === 0) throw new AppError("PROOF_MISSING", "Attach a screenshot of your payment.", 400);
  if (input.length > MAX_PROOF_BYTES) throw new AppError("PROOF_TOO_LARGE", "The screenshot must be under 8 MB.", 413);
  try {
    const img = sharp(input, { failOn: "error", limitInputPixels: 50_000_000 });
    const meta = await img.metadata();
    if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) throw new Error("format");
    const image = await img
      .rotate()
      .resize({ width: 1600, height: 3200, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    return { image, contentType: "image/jpeg" };
  } catch {
    throw new AppError("PROOF_INVALID", "That file isn’t a readable image. Upload a JPG or PNG screenshot.", 400);
  }
}

/**
 * Buyer submits their UPI payment proof. The booking moves to `in_review` and
 * keeps its places until an organiser approves or rejects it. A booking whose
 * hold already lapsed is accepted only if places are still available.
 */
export async function submitPaymentProof(
  db: DB,
  input: { userId: string; bookingId: string; utr: string; payerName?: string | null; file: Buffer },
) {
  const utr = normalizeUtr(input.utr);
  if (!utr)
    throw new AppError("UTR_INVALID", "Enter the UPI transaction ID (UTR) from your payment — letters and numbers only.", 400);
  const payerName = input.payerName?.trim().slice(0, 80) || null;
  const sha256 = createHash("sha256").update(input.file).digest("hex");
  const { image, contentType } = await processProofImage(input.file);

  return db.transaction(async (tx) => {
    // Lock order everywhere: event_settings (inventory) → booking row.
    const settings = await lockSettingsForUpdate(tx);
    const [booking] = await tx
      .select()
      .from(bookings)
      .where(and(eq(bookings.id, input.bookingId), eq(bookings.userId, input.userId)))
      .for("update");
    if (!booking) throw new AppError("NOT_FOUND", "Booking not found.", 404);
    if (booking.status === "in_review")
      throw new AppError("ALREADY_SUBMITTED", "You’ve already submitted payment proof for this booking.", 409);
    if (booking.status !== "pending_payment" && booking.status !== "expired") {
      throw new AppError("NOT_PAYABLE", "This booking can’t take a payment any more.", 409);
    }

    const reused = await tx
      .select({ id: paymentProofs.id })
      .from(paymentProofs)
      .innerJoin(bookings, eq(bookings.id, paymentProofs.bookingId))
      .where(and(eq(paymentProofs.utr, utr), ne(bookings.status, "rejected")))
      .limit(1);
    if (reused.length) {
      throw new AppError(
        "UTR_USED",
        "That transaction ID has already been used for another booking. Check it and try again.",
        409,
      );
    }

    const live = await tx.execute<{ live: boolean }>(sql`
      SELECT (status = 'active' AND expires_at > now()) AS live FROM inventory_holds WHERE booking_id = ${booking.id}
    `);
    if (!live.rows[0]?.live) {
      const capacity = effectiveCapacity(settings, booking.isDemo);
      const used = await placesInUse(tx, booking.id);
      if (capacity == null || used + booking.quantityTotal > capacity) {
        throw new AppError(
          "NO_PLACES",
          "Your hold expired and there aren’t enough places left. If you’ve already paid, contact the organisers with your transaction ID.",
          409,
        );
      }
    }

    // Keep the places (and any coupon use) until an organiser decides.
    const keepUntil = new Date(eventEndsAt(settings).getTime() + 7 * 86_400_000);
    await tx.insert(paymentProofs).values({
      bookingId: booking.id,
      userId: input.userId,
      utr,
      payerName,
      amountPaise: booking.totalPaise,
      image,
      contentType,
      sizeBytes: image.length,
      sha256,
    });
    await tx
      .update(bookings)
      .set({ status: "in_review", paymentSubmittedAt: new Date(), holdExpiresAt: keepUntil, statusReason: null })
      .where(eq(bookings.id, booking.id));
    await tx
      .update(inventoryHolds)
      .set({ status: "active", expiresAt: keepUntil, releasedAt: null, releaseReason: null })
      .where(and(eq(inventoryHolds.bookingId, booking.id), ne(inventoryHolds.status, "consumed")));
    await tx
      .update(couponReservations)
      .set({ status: "held", expiresAt: keepUntil, releasedAt: null })
      .where(and(eq(couponReservations.bookingId, booking.id), ne(couponReservations.status, "committed")));
    if (settings.organiserEmail) {
      await tx
        .insert(emailOutbox)
        .values({
          kind: "proof_submitted_admin",
          bookingId: booking.id,
          toEmail: settings.organiserEmail,
          dedupeKey: `proof_submitted_admin:${booking.id}`,
        })
        .onConflictDoNothing({ target: emailOutbox.dedupeKey });
    }
    await logBookingEvent(tx, booking.id, booking.status, "in_review", "buyer", `Payment proof submitted (UTR ${utr})`);
    return { bookingId: booking.id, utr };
  });
}
