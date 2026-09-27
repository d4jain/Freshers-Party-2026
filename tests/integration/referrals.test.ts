import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCheckout } from "@/lib/booking/checkout";
import { submitPaymentProof } from "@/lib/booking/payment-proof";
import { approveBooking, cancelBooking } from "@/lib/booking/review";
import type { DB } from "@/lib/db";
import { referralCodes, referralPayouts, tickets } from "@/lib/db/schema";
import { getOrCreateUserReferralCode, recordReferralPayout, referralProgress, studentReferralBoard } from "@/lib/referrals";
import { redeemTicket } from "@/lib/tickets/checkin";
import { createTestDatabase } from "../helpers/db";
import { bookingInput, createUser, nextUtr, openSales, screenshotPng } from "../helpers/fixtures";

let db: DB;
let cleanup: () => Promise<void>;
let admin: { id: string };

beforeAll(async () => {
  ({ db, cleanup } = await createTestDatabase());
});
afterAll(async () => cleanup());
beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE referral_payouts, referral_codes, bookings, check_in_events, audit_events, "user" RESTART IDENTITY CASCADE`,
  );
  await db.execute(sql`DELETE FROM event_settings`);
  await openSales(db, { maxGroupSize: 10 });
  admin = await createUser(db, { role: "admin" });
});

/** A friend books `qty` places with `code`, pays, and is approved. Returns the passes. */
async function friendBooks(code: string, qty: number) {
  const f = await createUser(db, { name: "Friend" });
  const c = await createCheckout(
    { db, demo: false, requireVerifiedEmail: true },
    f.id,
    bookingInput({ quantityTotal: qty, quantityGirls: 0, quantityBoys: qty, referralCode: code }),
  );
  await submitPaymentProof(db, { userId: f.id, bookingId: c.bookingId, utr: nextUtr(), file: await screenshotPng() });
  await approveBooking(db, { adminId: admin.id, bookingId: c.bookingId });
  return { bookingId: c.bookingId, passes: await db.select().from(tickets).where(eq(tickets.bookingId, c.bookingId)) };
}

async function checkIn(passes: { id: string }[]) {
  for (const p of passes) await redeemTicket(db, { staffUserId: admin.id, ticketId: p.id, demoAllowed: false });
}

describe("Refer Now codes", () => {
  it("creates one NAME+4-digit code per student, even under concurrent requests", async () => {
    const u = await createUser(db, { name: "Riya Verma" });
    const codes = await Promise.all(
      Array.from({ length: 6 }, () => getOrCreateUserReferralCode(db, { id: u.id, name: "Riya Verma" })),
    );
    expect(new Set(codes.map((c) => c.code)).size).toBe(1);
    expect(codes[0]!.code).toMatch(/^RIYA\d{4}$/);
    expect(codes[0]!.ownerType).toBe("user");
    const rows = await db.select().from(referralCodes).where(eq(referralCodes.ownerUserId, u.id));
    expect(rows).toHaveLength(1);
    expect((await getOrCreateUserReferralCode(db, { id: u.id, name: "Riya Verma" })).code).toBe(codes[0]!.code);
  });

  it("gives students with the same first 4 letters different codes", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const u = await createUser(db, { name: "Aarav Sharma" });
      seen.add((await getOrCreateUserReferralCode(db, { id: u.id, name: "Aarav Sharma" })).code);
    }
    expect(seen.size).toBe(25);
    expect([...seen].every((c) => /^AARA\d{4}$/.test(c))).toBe(true);
  });

  it("won't let a student use their own code", async () => {
    const u = await createUser(db, { name: "Riya Verma" });
    const code = await getOrCreateUserReferralCode(db, { id: u.id, name: "Riya Verma" });
    await expect(
      createCheckout({ db, demo: false, requireVerifiedEmail: true }, u.id, bookingInput({ referralCode: code.code })),
    ).rejects.toMatchObject({ code: "SELF_REFERRAL" });
  });
});

describe("Refer Now progress and payouts", () => {
  it("counts only checked-in people from confirmed bookings made with the code", async () => {
    const r = await createUser(db, { name: "Riya Verma" });
    const code = await getOrCreateUserReferralCode(db, { id: r.id, name: "Riya Verma" });

    const a = await friendBooks(code.code, 3);
    await checkIn(a.passes.slice(0, 2)); // one friend didn't turn up
    const cancelled = await friendBooks(code.code, 2);
    await checkIn(cancelled.passes);
    await cancelBooking(db, { adminId: admin.id, bookingId: cancelled.bookingId, reason: "duplicate booking" });
    // Paid but still in review: not counted.
    const f = await createUser(db);
    const pending = await createCheckout(
      { db, demo: false, requireVerifiedEmail: true },
      f.id,
      bookingInput({ referralCode: code.code }),
    );
    await submitPaymentProof(db, { userId: f.id, bookingId: pending.bookingId, utr: nextUtr(), file: await screenshotPng() });

    const p = await referralProgress(db, code.id);
    expect(p).toMatchObject({ confirmedPeople: 3, attended: 2, rewardPaise: 0, duePaise: 0, next: { min: 5 } });
  });

  it("pays the highest tier, tops up when a higher tier is reached, and never overpays", async () => {
    const r = await createUser(db, { name: "Riya Verma" });
    const code = await getOrCreateUserReferralCode(db, { id: r.id, name: "Riya Verma" });
    await checkIn((await friendBooks(code.code, 5)).passes);
    expect(await referralProgress(db, code.id)).toMatchObject({ attended: 5, rewardPaise: 10_000, duePaise: 10_000 });

    await expect(
      recordReferralPayout(db, { adminId: admin.id, referralCodeId: code.id, amountPaise: 20_000, method: "upi" }),
    ).rejects.toMatchObject({ code: "OVERPAYMENT" });

    // Two organisers tap "Record payout" at the same moment: only one goes through.
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        recordReferralPayout(db, { adminId: admin.id, referralCodeId: code.id, amountPaise: 10_000, method: "cash" }),
      ),
    );
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(referralPayouts)).toHaveLength(1);
    expect(await referralProgress(db, code.id)).toMatchObject({ paidPaise: 10_000, duePaise: 0 });

    // 5 more friends arrive → 10 attended → ₹200 tier, so ₹100 more is due.
    await checkIn((await friendBooks(code.code, 5)).passes);
    expect(await referralProgress(db, code.id)).toMatchObject({ attended: 10, rewardPaise: 20_000, duePaise: 10_000 });
    const top = await recordReferralPayout(db, {
      adminId: admin.id,
      referralCodeId: code.id,
      amountPaise: 10_000,
      method: "upi",
    });
    expect(top.progress).toMatchObject({ paidPaise: 20_000, duePaise: 0 });

    const board = await studentReferralBoard(db);
    expect(board).toHaveLength(1);
    expect(board[0]).toMatchObject({ code: code.code, ownerName: "Riya Verma", attended: 10, paidPaise: 20_000, duePaise: 0 });
  });

  it("reaches the ₹500 top tier at 30 attendees", async () => {
    const r = await createUser(db, { name: "Riya Verma" });
    const code = await getOrCreateUserReferralCode(db, { id: r.id, name: "Riya Verma" });
    for (let i = 0; i < 3; i++) await checkIn((await friendBooks(code.code, 10)).passes);
    expect(await referralProgress(db, code.id)).toMatchObject({ attended: 30, rewardPaise: 50_000, next: null });
  });
});
