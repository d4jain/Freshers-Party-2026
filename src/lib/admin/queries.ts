import { and, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Queryable } from "@/lib/db";
import { auditEvents, bookingExceptions, bookings, coupons, referralCodes } from "@/lib/db/schema";
import { placesInUse } from "@/lib/settings";

export async function overviewStats(db: Queryable) {
  const [b] = (
    await db.execute<{
      confirmed_bookings: string;
      confirmed_people: string;
      girls: string;
      boys: string;
      pending_bookings: string;
      needs_review: string;
      refunded_bookings: string;
      demo_confirmed: string;
    }>(sql`
      SELECT
        count(*) FILTER (WHERE status = 'confirmed' AND NOT is_demo) AS confirmed_bookings,
        coalesce(sum(quantity_total) FILTER (WHERE status = 'confirmed' AND NOT is_demo), 0) AS confirmed_people,
        coalesce(sum(quantity_girls) FILTER (WHERE status = 'confirmed' AND NOT is_demo), 0) AS girls,
        coalesce(sum(quantity_boys) FILTER (WHERE status = 'confirmed' AND NOT is_demo), 0) AS boys,
        count(*) FILTER (WHERE status = 'pending_payment') AS pending_bookings,
        count(*) FILTER (WHERE status = 'needs_review') AS needs_review,
        count(*) FILTER (WHERE status = 'refunded') AS refunded_bookings,
        count(*) FILTER (WHERE status = 'confirmed' AND is_demo) AS demo_confirmed
      FROM bookings
    `)
  ).rows;
  const [p] = (
    await db.execute<{ gross: string; refunded: string; captures: string }>(sql`
      SELECT
        coalesce(sum(amount_paise) FILTER (WHERE status IN ('captured','partially_refunded','refunded') AND provider <> 'demo'), 0) AS gross,
        coalesce(sum(amount_refunded_paise) FILTER (WHERE provider <> 'demo'), 0) AS refunded,
        count(*) FILTER (WHERE status IN ('captured','partially_refunded','refunded') AND provider <> 'demo') AS captures
      FROM payment_attempts
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
    await db.execute<{ open_exceptions: string; email_failed: string; email_pending: string }>(sql`
      SELECT
        (SELECT count(*) FROM booking_exceptions WHERE resolved_at IS NULL) AS open_exceptions,
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
    pendingBookings: n(b?.pending_bookings),
    needsReview: n(b?.needs_review),
    refundedBookings: n(b?.refunded_bookings),
    demoConfirmed: n(b?.demo_confirmed),
    grossCapturedPaise: n(p?.gross),
    refundedPaise: n(p?.refunded),
    captures: n(p?.captures),
    ticketsIssued: n(t?.issued),
    ticketsValid: n(t?.valid),
    checkedIn: n(t?.checked_in),
    openExceptions: n(x?.open_exceptions),
    emailFailed: n(x?.email_failed),
    emailPending: n(x?.email_pending),
    placesInUse: inUse,
  };
}

export const BOOKING_STATUSES = ["pending_payment", "confirmed", "expired", "needs_review", "refunded"] as const;

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
        ilike(bookings.gatewayOrderId, like),
        ilike(bookings.capturedPaymentId, like),
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

export async function openExceptions(db: Queryable, includeResolved = false) {
  return db
    .select({ e: bookingExceptions, reference: bookings.reference, bookerName: bookings.bookerName, status: bookings.status })
    .from(bookingExceptions)
    .leftJoin(bookings, eq(bookings.id, bookingExceptions.bookingId))
    .where(includeResolved ? undefined : isNull(bookingExceptions.resolvedAt))
    .orderBy(desc(bookingExceptions.createdAt))
    .limit(200);
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
