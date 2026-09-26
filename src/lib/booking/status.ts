import { and, asc, desc, eq } from "drizzle-orm";
import type { Queryable } from "@/lib/db";
import { bookings, paymentAttempts, tickets, type Booking } from "@/lib/db/schema";
import type { PriceBreakdown } from "@/lib/pricing";

export type PaymentEvidence = "none" | "failed" | "authorized" | "captured" | "refunded";

export type BookingStatusView = {
  id: string;
  reference: string;
  status: Booking["status"];
  isDemo: boolean;
  provider: string;
  holdExpiresAt: string;
  createdAt: string;
  confirmedAt: string | null;
  quantityTotal: number;
  quantityGirls: number;
  quantityBoys: number;
  totalPaise: number;
  breakdown: PriceBreakdown;
  couponCode: string | null;
  referralCode: string | null;
  paymentEvidence: PaymentEvidence;
  headline: string;
  detail: string;
  ticketCount: number;
};

export function describeStatus(status: Booking["status"], evidence: PaymentEvidence, holdLive: boolean) {
  switch (status) {
    case "confirmed":
      return { headline: "You’re on the guest list", detail: "Your passes are ready below." };
    case "refunded":
      return { headline: "Booking refunded", detail: "This booking was refunded, so its passes are no longer valid." };
    case "needs_review":
      return {
        headline: "Payment received — under review",
        detail:
          "We received a payment but couldn’t confirm this booking automatically. The organisers will review it and contact you. Please don’t pay again.",
      };
    case "expired":
      return evidence === "captured" || evidence === "authorized"
        ? {
            headline: "Payment received; confirming your booking",
            detail: "This can take a minute. Keep this page open or check back soon.",
          }
        : {
            headline: "Hold expired",
            detail: "No payment was captured before your held places expired. You can start a new booking.",
          };
    case "pending_payment":
      if (evidence === "captured" || evidence === "authorized") {
        return { headline: "Payment received; confirming your booking", detail: "This can take a minute. Don’t pay again." };
      }
      return holdLive
        ? {
            headline: "Checking payment status",
            detail: "If you haven’t paid yet, you can complete payment while your places are held.",
          }
        : { headline: "Checking payment status", detail: "Your hold has passed. We’re making a final check for any payment." };
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
  const attempts = await db
    .select({ status: paymentAttempts.status })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.bookingId, b.id))
    .orderBy(desc(paymentAttempts.updatedAt));
  let evidence: PaymentEvidence = "none";
  if (attempts.some((a) => a.status === "refunded")) evidence = "refunded";
  if (attempts.some((a) => a.status === "captured" || a.status === "partially_refunded")) evidence = "captured";
  else if (attempts.some((a) => a.status === "authorized")) evidence = "authorized";
  else if (evidence === "none" && attempts.some((a) => a.status === "failed")) evidence = "failed";

  const ticketRows = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(eq(tickets.bookingId, b.id))
    .orderBy(asc(tickets.ticketIndex));
  const holdLive = b.holdExpiresAt.getTime() > Date.now();
  const { headline, detail } = describeStatus(b.status, evidence, holdLive);

  return {
    id: b.id,
    reference: b.reference,
    status: b.status,
    isDemo: b.isDemo,
    provider: b.paymentProvider,
    holdExpiresAt: b.holdExpiresAt.toISOString(),
    createdAt: b.createdAt.toISOString(),
    confirmedAt: b.confirmedAt ? b.confirmedAt.toISOString() : null,
    quantityTotal: b.quantityTotal,
    quantityGirls: b.quantityGirls,
    quantityBoys: b.quantityBoys,
    totalPaise: b.totalPaise,
    breakdown: b.pricingSnapshot as PriceBreakdown,
    couponCode: b.couponCode,
    referralCode: b.referralCode,
    paymentEvidence: evidence,
    headline,
    detail,
    ticketCount: ticketRows.length,
  };
}
