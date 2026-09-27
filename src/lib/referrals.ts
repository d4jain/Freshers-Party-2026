import { randomInt } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { REFERRAL_TIERS, type ReferralTier } from "@/config/referrals";
import { recordAudit } from "@/lib/audit";
import type { DB, Queryable } from "@/lib/db";
import { referralCodes, referralPayouts } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";

export type ReferralCodeRow = typeof referralCodes.$inferSelect;

/** Reward for a number of attended referrals: the highest tier reached (tiers don't stack). */
export function referralReward(attended: number): number {
  let reward = 0;
  for (const t of REFERRAL_TIERS) if (attended >= t.min) reward = t.rewardPaise;
  return reward;
}

export function nextReferralTier(attended: number): ReferralTier | null {
  return REFERRAL_TIERS.find((t) => attended < t.min) ?? null;
}

/** First 4 letters of the name (accents stripped), padded with X: "Riya Verma" → "RIYA", "Om" → "OMXX". */
export function referralPrefix(name: string): string {
  const letters = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return (letters + "XXXX").slice(0, 4);
}

async function findUserCode(db: Queryable, userId: string) {
  const [row] = await db
    .select()
    .from(referralCodes)
    .where(and(eq(referralCodes.ownerType, "user"), eq(referralCodes.ownerUserId, userId)))
    .limit(1);
  return row ?? null;
}

/**
 * The student's personal "Refer Now" code — 4 letters from their name + 4
 * random digits (e.g. RIYA4821) — created on first use. Unique across all
 * referral codes; at most one per student (DB-enforced).
 */
export async function getOrCreateUserReferralCode(db: DB, u: { id: string; name: string }): Promise<ReferralCodeRow> {
  const existing = await findUserCode(db, u.id);
  if (existing) return existing;
  const prefix = referralPrefix(u.name);
  for (let attempt = 0; attempt < 30; attempt++) {
    const code = prefix + String(randomInt(0, 10_000)).padStart(4, "0");
    const [row] = await db
      .insert(referralCodes)
      .values({
        code,
        label: `Refer Now — ${u.name}`.slice(0, 120),
        ownerType: "user",
        ownerUserId: u.id,
        createdBy: "refer-now",
      })
      .onConflictDoNothing() // code taken, or a parallel request already created this student's code
      .returning();
    if (row) return row;
    const raced = await findUserCode(db, u.id);
    if (raced) return raced;
  }
  throw new AppError("REFERRAL_CODE_UNAVAILABLE", "Couldn’t create a referral code right now. Please try again.", 503);
}

export type ReferralProgress = {
  /** People on confirmed bookings made with the code (the referrer's own bookings excluded). */
  confirmedPeople: number;
  /** Of those, passes checked in at the party — what rewards are based on. */
  attended: number;
  rewardPaise: number;
  paidPaise: number;
  duePaise: number;
  next: ReferralTier | null;
};

function progressFrom(confirmedPeople: number, attended: number, paidPaise: number): ReferralProgress {
  const rewardPaise = referralReward(attended);
  return {
    confirmedPeople,
    attended,
    rewardPaise,
    paidPaise,
    duePaise: Math.max(0, rewardPaise - paidPaise),
    next: nextReferralTier(attended),
  };
}

const PROGRESS_SQL = (where: ReturnType<typeof sql>) => sql`
  SELECT rc.id,
    coalesce((SELECT sum(b.quantity_total) FROM bookings b
      WHERE b.referral_code_id = rc.id AND b.status = 'confirmed'
        AND b.user_id IS DISTINCT FROM rc.owner_user_id), 0) AS confirmed_people,
    (SELECT count(*) FROM tickets t JOIN bookings b ON b.id = t.booking_id
      WHERE b.referral_code_id = rc.id AND b.status = 'confirmed' AND t.status = 'valid'
        AND t.checked_in_at IS NOT NULL AND b.user_id IS DISTINCT FROM rc.owner_user_id) AS attended,
    coalesce((SELECT sum(p.amount_paise) FROM referral_payouts p WHERE p.referral_code_id = rc.id), 0) AS paid
  FROM referral_codes rc
  WHERE ${where}
`;

type ProgressRow = { id: string; confirmed_people: string; attended: string; paid: string };

export async function referralProgress(db: Queryable, referralCodeId: string): Promise<ReferralProgress> {
  const res = await db.execute<ProgressRow>(PROGRESS_SQL(sql`rc.id = ${referralCodeId}`));
  const r = res.rows[0];
  return progressFrom(Number(r?.confirmed_people ?? 0), Number(r?.attended ?? 0), Number(r?.paid ?? 0));
}

/** Admin: every student code that has brought at least one confirmed booking or been paid out. */
export async function studentReferralBoard(db: Queryable) {
  const res = await db.execute<
    ProgressRow & { code: string; owner_name: string | null; owner_email: string | null; owner_phone: string | null }
  >(sql`
    SELECT x.*, rc.code, u.name AS owner_name, u.email AS owner_email, u.phone AS owner_phone
    FROM (${PROGRESS_SQL(sql`rc.owner_type = 'user'`)}) x
    JOIN referral_codes rc ON rc.id = x.id
    LEFT JOIN "user" u ON u.id = rc.owner_user_id
    WHERE x.confirmed_people > 0 OR x.paid > 0
    ORDER BY x.attended DESC, x.confirmed_people DESC, rc.code
  `);
  return res.rows.map((r) => ({
    id: r.id,
    code: r.code,
    ownerName: r.owner_name,
    ownerEmail: r.owner_email,
    ownerPhone: r.owner_phone,
    ...progressFrom(Number(r.confirmed_people), Number(r.attended), Number(r.paid)),
  }));
}

/**
 * Organiser records a cash/UPI reward handed over at the party. Never more
 * than what's currently due, so a double tap or two organisers can't overpay
 * (the code row is locked while checking).
 */
export async function recordReferralPayout(
  db: DB,
  opts: { adminId: string; referralCodeId: string; amountPaise: number; method: "cash" | "upi"; note?: string | null },
) {
  if (!Number.isInteger(opts.amountPaise) || opts.amountPaise <= 0) {
    throw new AppError("AMOUNT_INVALID", "Enter an amount above ₹0.", 400);
  }
  return db.transaction(async (tx) => {
    const [code] = await tx.select().from(referralCodes).where(eq(referralCodes.id, opts.referralCodeId)).for("update");
    if (!code || code.ownerType !== "user") throw new AppError("NOT_FOUND", "Referral code not found.", 404);
    const progress = await referralProgress(tx, code.id);
    if (opts.amountPaise > progress.duePaise) {
      throw new AppError(
        "OVERPAYMENT",
        progress.duePaise === 0
          ? `Nothing is due for ${code.code} right now.`
          : `Only ₹${progress.duePaise / 100} is due for ${code.code}.`,
        409,
      );
    }
    const [payout] = await tx
      .insert(referralPayouts)
      .values({
        referralCodeId: code.id,
        amountPaise: opts.amountPaise,
        method: opts.method,
        attendedAtPayout: progress.attended,
        note: opts.note?.trim().slice(0, 200) || null,
        paidBy: opts.adminId,
      })
      .returning();
    await recordAudit(tx, {
      actorUserId: opts.adminId,
      action: "referral.payout",
      targetType: "referral_code",
      targetId: code.id,
      details: { code: code.code, amountPaise: opts.amountPaise, method: opts.method, attended: progress.attended },
    });
    const paidPaise = progress.paidPaise + opts.amountPaise;
    return {
      payout: payout!,
      code: code.code,
      progress: { ...progress, paidPaise, duePaise: Math.max(0, progress.rewardPaise - paidPaise) },
    };
  });
}
