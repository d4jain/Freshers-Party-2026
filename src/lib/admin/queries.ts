import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import type { Queryable } from "@/lib/db";
import { auditEvents, bookings, coupons, referralCodes } from "@/lib/db/schema";
import { placesInUse } from "@/lib/settings";

export async function overviewStats(db: Queryable) {
  const [b] = (
    await db.execute<{
      confirmed_bookings: string;
      confirmed_people: string;
      girls: string;
      boys: string;
      confirmed_total: string;
      in_review: string;
      in_review_total: string;
      pending_bookings: string;
      rejected: string;
      cancelled: string;
      demo_confirmed: string;
    }>(sql`
      SELECT
        count(*) FILTER (WHERE status = 'confirmed' AND NOT is_demo) AS confirmed_bookings,
        coalesce(sum(quantity_total) FILTER (WHERE status = 'confirmed' AND NOT is_demo), 0) AS confirmed_people,
        coalesce(sum(quantity_girls) FILTER (WHERE status = 'confirmed' AND NOT is_demo), 0) AS girls,
        coalesce(sum(quantity_boys) FILTER (WHERE status = 'confirmed' AND NOT is_demo), 0) AS boys,
        coalesce(sum(total_paise) FILTER (WHERE status = 'confirmed' AND NOT is_demo), 0) AS confirmed_total,
        count(*) FILTER (WHERE status = 'in_review') AS in_review,
        coalesce(sum(total_paise) FILTER (WHERE status = 'in_review'), 0) AS in_review_total,
        count(*) FILTER (WHERE status = 'pending_payment') AS pending_bookings,
        count(*) FILTER (WHERE status = 'rejected') AS rejected,
        count(*) FILTER (WHERE status = 'cancelled') AS cancelled,
        count(*) FILTER (WHERE status = 'confirmed' AND is_demo) AS demo_confirmed
      FROM bookings
    `)
  ).rows;
  const [t] = (
    await db.execute<{ issued: string; valid: string; checked_in: string }>(sql`
      SELECT count(*) FILTER (WHERE NOT is_demo) AS issued,
             count(*) FILTER (WHERE status = 'valid' AND NOT is_demo) AS valid,
             count(*) FILTER (WHERE checked_in_at IS NOT NULL AND NOT is_demo) AS checked_in
      FROM tickets
    `)
  ).rows;
  const [x] = (
    await db.execute<{ email_failed: string; email_pending: string }>(sql`
      SELECT
        (SELECT count(*) FROM email_outbox WHERE status = 'failed') AS email_failed,
        (SELECT count(*) FROM email_outbox WHERE status IN ('pending','sending')) AS email_pending
    `)
  ).rows;
  const inUse = await placesInUse(db);
  const n = (v: string | undefined) => Number(v ?? 0);
  return {
    confirmedBookings: n(b?.confirmed_bookings),
    confirmedPeople: n(b?.confirmed_people),
    girls: n(b?.girls),
    boys: n(b?.boys),
    verifiedTotalPaise: n(b?.confirmed_total),
    inReview: n(b?.in_review),
    inReviewTotalPaise: n(b?.in_review_total),
    pendingBookings: n(b?.pending_bookings),
    rejected: n(b?.rejected),
    cancelled: n(b?.cancelled),
    demoConfirmed: n(b?.demo_confirmed),
    ticketsIssued: n(t?.issued),
    ticketsValid: n(t?.valid),
    checkedIn: n(t?.checked_in),
    emailFailed: n(x?.email_failed),
    emailPending: n(x?.email_pending),
    placesInUse: inUse,
  };
}

export const BOOKING_STATUSES = ["pending_payment", "in_review", "confirmed", "rejected", "expired", "cancelled"] as const;

export async function searchBookings(db: Queryable, opts: { q?: string; status?: string; page?: number; pageSize?: number }) {
  const pageSize = opts.pageSize ?? 50;
  const page = Math.max(1, opts.page ?? 1);
  const conds: SQL[] = [];
  if (opts.status && (BOOKING_STATUSES as readonly string[]).includes(opts.status)) {
    conds.push(eq(bookings.status, opts.status as (typeof BOOKING_STATUSES)[number]));
  }
  const q = opts.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conds.push(
      or(
        ilike(bookings.reference, like),
        ilike(bookings.bookerEmail, like),
        ilike(bookings.bookerPhone, like),
        ilike(bookings.bookerName, like),
        sql`EXISTS (SELECT 1 FROM payment_proofs p WHERE p.booking_id = ${bookings.id} AND p.utr ILIKE ${like})`,
        ilike(bookings.couponCode, like),
        ilike(bookings.referralCode, like),
      )!,
    );
  }
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select()
    .from(bookings)
    .where(where)
    .orderBy(desc(bookings.createdAt))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
  return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize, page };
}

/**
 * Bookings waiting for an organiser to verify payment, oldest first, with
 * duplicate-proof signals (same transaction id or same screenshot elsewhere).
 */
export async function reviewQueue(db: Queryable, status: "in_review" | "all_recent" = "in_review") {
  const filter = status === "in_review" ? sql`b.status = 'in_review'` : sql`p.submitted_at > now() - interval '14 days'`;
  const rows = await db.execute<{
    id: string;
    reference: string;
    status: string;
    booker_name: string;
    booker_phone: string;
    booker_email: string;
    quantity_total: number;
    quantity_girls: number;
    quantity_boys: number;
    total_paise: number;
    coupon_code: string | null;
    is_demo: boolean;
    utr: string;
    payer_name: string | null;
    proof_amount_paise: number;
    submitted_at: Date;
    same_utr: string;
    same_image: string;
  }>(sql`
    SELECT b.id, b.reference, b.status, b.booker_name, b.booker_phone, b.booker_email, b.quantity_total, b.quantity_girls,
           b.quantity_boys, b.total_paise, b.coupon_code, b.is_demo, p.utr, p.payer_name, p.amount_paise AS proof_amount_paise,
           p.submitted_at,
           (SELECT count(*) FROM payment_proofs o WHERE o.utr = p.utr AND o.id <> p.id) AS same_utr,
           (SELECT count(*) FROM payment_proofs o WHERE o.sha256 = p.sha256 AND o.id <> p.id) AS same_image
    FROM payment_proofs p JOIN bookings b ON b.id = p.booking_id
    WHERE ${filter}
    ORDER BY p.submitted_at ASC
    LIMIT 200
  `);
  return rows.rows.map((r) => ({ ...r, same_utr: Number(r.same_utr), same_image: Number(r.same_image) }));
}

export async function couponReport(db: Queryable) {
  const list = await db.select().from(coupons).orderBy(desc(coupons.createdAt));
  const usage = await db.execute<{
    coupon_id: string;
    held: string;
    committed: string;
    paid_bookings: string;
    paid_people: string;
    paid_total: string;
    discount_total: string;
  }>(sql`
    SELECT c.id AS coupon_id,
      (SELECT count(*) FROM coupon_reservations r WHERE r.coupon_id = c.id AND r.status = 'held' AND r.expires_at > now()) AS held,
      (SELECT count(*) FROM coupon_reservations r WHERE r.coupon_id = c.id AND r.status = 'committed') AS committed,
      (SELECT count(*) FROM bookings b WHERE b.coupon_id = c.id AND b.status = 'confirmed' AND NOT b.is_demo) AS paid_bookings,
      (SELECT coalesce(sum(quantity_total),0) FROM bookings b WHERE b.coupon_id = c.id AND b.status = 'confirmed' AND NOT b.is_demo) AS paid_people,
      (SELECT coalesce(sum(total_paise),0) FROM bookings b WHERE b.coupon_id = c.id AND b.status = 'confirmed' AND NOT b.is_demo) AS paid_total,
      (SELECT coalesce(sum(discount_paise),0) FROM bookings b WHERE b.coupon_id = c.id AND b.status = 'confirmed' AND NOT b.is_demo) AS discount_total
    FROM coupons c
  `);
  const byId = new Map(usage.rows.map((u) => [u.coupon_id, u]));
  return list.map((c) => {
    const u = byId.get(c.id);
    return {
      coupon: c,
      held: Number(u?.held ?? 0),
      committed: Number(u?.committed ?? 0),
      paidBookings: Number(u?.paid_bookings ?? 0),
      paidPeople: Number(u?.paid_people ?? 0),
      paidTotalPaise: Number(u?.paid_total ?? 0),
      discountTotalPaise: Number(u?.discount_total ?? 0),
    };
  });
}

export async function referralReport(db: Queryable) {
  const list = await db.select().from(referralCodes).orderBy(desc(referralCodes.createdAt));
  const usage = await db.execute<{
    id: string;
    signups: string;
    paid_bookings: string;
    paid_people: string;
    paid_total: string;
  }>(sql`
    SELECT r.id,
      (SELECT count(*) FROM "user" u WHERE u.signup_referral_code_id = r.id) AS signups,
      (SELECT count(*) FROM bookings b WHERE b.referral_code_id = r.id AND b.status = 'confirmed' AND NOT b.is_demo) AS paid_bookings,
      (SELECT coalesce(sum(quantity_total),0) FROM bookings b WHERE b.referral_code_id = r.id AND b.status = 'confirmed' AND NOT b.is_demo) AS paid_people,
      (SELECT coalesce(sum(total_paise),0) FROM bookings b WHERE b.referral_code_id = r.id AND b.status = 'confirmed' AND NOT b.is_demo) AS paid_total
    FROM referral_codes r
  `);
  const byId = new Map(usage.rows.map((u) => [u.id, u]));
  return list.map((r) => {
    const u = byId.get(r.id);
    return {
      referral: r,
      signups: Number(u?.signups ?? 0),
      paidBookings: Number(u?.paid_bookings ?? 0),
      paidPeople: Number(u?.paid_people ?? 0),
      paidTotalPaise: Number(u?.paid_total ?? 0),
    };
  });
}

export async function recentAudit(db: Queryable, limit = 200) {
  return db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(limit);
}
