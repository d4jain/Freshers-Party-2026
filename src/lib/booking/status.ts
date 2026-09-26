import { and, asc, eq } from "drizzle-orm";
import type { Queryable } from "@/lib/db";
import { bookings, paymentProofs, tickets, type Booking } from "@/lib/db/schema";
import type { PriceBreakdown } from "@/lib/pricing";

export type BookingStatusView = {
  id: string;
  reference: string;
  status: Booking["status"];
  isDemo: boolean;
  holdExpiresAt: string;
  createdAt: string;
  confirmedAt: string | null;
  paymentSubmittedAt: string | null;
  quantityTotal: number;
  quantityGirls: number;
  quantityBoys: number;
  totalPaise: number;
  breakdown: PriceBreakdown;
  couponCode: string | null;
  referralCode: string | null;
  /** Shown to the buyer on rejection/cancellation. */
  reviewNote: string | null;
  proof: { utr: string; submittedAt: string } | null;
  headline: string;
  detail: string;
  ticketCount: number;
};

export function describeStatus(status: Booking["status"], holdLive: boolean) {
  switch (status) {
    case "confirmed":
      return { headline: "You’re on the guest list", detail: "Your payment was verified. Your passes are ready below." };
    case "in_review":
      return {
        headline: "In review",
        detail:
          "We’ve got your payment proof. The organisers will check it against their UPI account and confirm your booking — your passes appear here once approved. Please don’t pay again.",
      };
    case "pending_payment":
      return holdLive
        ? {
            headline: "Complete your payment",
            detail: "Pay the exact amount using the QR below, then upload your payment screenshot.",
          }
        : {
            headline: "Hold expired",
            detail:
              "Your held places have lapsed. If you’ve already paid, upload your proof now — we’ll accept it if places are still available.",
          };
    case "expired":
      return {
        headline: "Hold expired",
        detail:
          "No payment proof was submitted in time. If you’ve already paid, upload your proof below; otherwise start a new booking.",
      };
    case "rejected":
      return {
        headline: "Payment not verified",
        detail: "The organisers couldn’t verify this payment, so the booking wasn’t confirmed.",
      };
    case "cancelled":
      return {
        headline: "Booking cancelled",
        detail: "This booking was cancelled by the organisers, so its passes are no longer valid.",
      };
  }
}

/** Owner-scoped read. Returns null for other users' bookings (no existence leak). */
export async function getBookingStatusForUser(
  db: Queryable,
  userId: string,
  bookingId: string,
): Promise<BookingStatusView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return null;
  const [b] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.userId, userId)))
    .limit(1);
  if (!b) return null;
  return buildStatusView(db, b);
}

export async function buildStatusView(db: Queryable, b: Booking): Promise<BookingStatusView> {
  const [proof] = await db
    .select({ utr: paymentProofs.utr, submittedAt: paymentProofs.submittedAt })
    .from(paymentProofs)
    .where(eq(paymentProofs.bookingId, b.id))
    .limit(1);
  const ticketRows = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(eq(tickets.bookingId, b.id))
    .orderBy(asc(tickets.ticketIndex));
  const holdLive = b.holdExpiresAt.getTime() > Date.now();
  const { headline, detail } = describeStatus(b.status, holdLive);

  return {
    id: b.id,
    reference: b.reference,
    status: b.status,
    isDemo: b.isDemo,
    holdExpiresAt: b.holdExpiresAt.toISOString(),
    createdAt: b.createdAt.toISOString(),
    confirmedAt: b.confirmedAt ? b.confirmedAt.toISOString() : null,
    paymentSubmittedAt: b.paymentSubmittedAt ? b.paymentSubmittedAt.toISOString() : null,
    quantityTotal: b.quantityTotal,
    quantityGirls: b.quantityGirls,
    quantityBoys: b.quantityBoys,
    totalPaise: b.totalPaise,
    breakdown: b.pricingSnapshot as PriceBreakdown,
    couponCode: b.couponCode,
    referralCode: b.referralCode,
    reviewNote: b.status === "rejected" || b.status === "cancelled" ? b.reviewNote : null,
    proof: proof ? { utr: proof.utr, submittedAt: proof.submittedAt.toISOString() } : null,
    headline,
    detail,
    ticketCount: ticketRows.length,
  };
}
