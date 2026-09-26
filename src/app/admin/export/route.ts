import { desc, eq } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";
import { requireRoleApi } from "@/lib/auth/session";
import { toCsv } from "@/lib/csv";
import { getDb } from "@/lib/db";
import { bookings, paymentProofs } from "@/lib/db/schema";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Operational CSV for organisers. Includes booking contacts, quantities,
 * amounts and UPI transaction ids. Never includes passwords, sessions, reset tokens,
 * payment secrets or QR tokens. Cells are formula-injection escaped.
 */
export async function GET(req: Request) {
  try {
    const admin = await requireRoleApi(req, ["admin"]);
    const db = getDb();
    const rows = await db
      .select({ b: bookings, utr: paymentProofs.utr, payerName: paymentProofs.payerName })
      .from(bookings)
      .leftJoin(paymentProofs, eq(paymentProofs.bookingId, bookings.id))
      .orderBy(desc(bookings.createdAt));
    const csv = toCsv(
      [
        "reference",
        "status",
        "demo",
        "created_at_utc",
        "confirmed_at_utc",
        "booker_name",
        "booker_phone",
        "booker_email",
        "people",
        "girls",
        "boys",
        "unit_price_inr",
        "discount_inr",
        "fees_inr",
        "total_inr",
        "coupon",
        "referral",
        "referral_source",
        "upi_transaction_id",
        "payer_name",
        "proof_submitted_at_utc",
        "reviewed_at_utc",
        "review_note",
      ],
      rows.map(({ b, utr, payerName }) => [
        b.reference,
        b.status,
        b.isDemo ? "yes" : "no",
        b.createdAt,
        b.confirmedAt,
        b.bookerName,
        b.bookerPhone,
        b.bookerEmail,
        b.quantityTotal,
        b.quantityGirls,
        b.quantityBoys,
        (b.unitPricePaise / 100).toFixed(2),
        (b.discountPaise / 100).toFixed(2),
        (b.feesPaise / 100).toFixed(2),
        (b.totalPaise / 100).toFixed(2),
        b.couponCode,
        b.referralCode,
        b.referralSource,
        utr,
        payerName,
        b.paymentSubmittedAt,
        b.reviewedAt,
        b.reviewNote,
      ]),
    );
    await recordAudit(db, { actorUserId: admin.id, action: "bookings.export_csv", details: { rows: rows.length } });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="freshers-2026-bookings-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
