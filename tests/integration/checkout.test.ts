import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCheckout, reserveBooking, type CheckoutDeps } from "@/lib/booking/checkout";
import { expireStaleBookings } from "@/lib/booking/reconcile";
import type { DB } from "@/lib/db";
import { bookings, coupons, couponReservations, eventSettings, inventoryHolds, referralCodes } from "@/lib/db/schema";
import { isAppError } from "@/lib/errors";
import { placesInUse } from "@/lib/settings";
import { createTestDatabase } from "../helpers/db";
import { bookingInput, createUser, expireHoldNow, openSales } from "../helpers/fixtures";

let db: DB;
let cleanup: () => Promise<void>;
let deps: CheckoutDeps;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDatabase());
});
afterAll(async () => cleanup());

beforeEach(async () => {
  await db.execute(sql`TRUNCATE bookings, coupons, referral_codes, "user" RESTART IDENTITY CASCADE`);
  await db.execute(sql`DELETE FROM event_settings`);
  await openSales(db);
  deps = { db, demo: false, requireVerifiedEmail: true };
});

async function expectAppError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    expect(isAppError(e) ? e.code : e).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe("checkout creation", () => {
  it("creates a pending booking with a hold and a server-computed amount", async () => {
    const u = await createUser(db);
    const res = await createCheckout(deps, u.id, bookingInput({ quantityTotal: 3, quantityGirls: 2, quantityBoys: 1 }));
    expect(res.status).toBe("pending_payment");
    expect(res.totalPaise).toBe(659_700);
    expect(res.isDemo).toBe(false);
    const [b] = await db.select().from(bookings).where(eq(bookings.id, res.bookingId));
    expect(b!.totalPaise).toBe(659_700);
    expect(b!.eligibilityAckVersion).toBe("eligibility-v1");
    expect(b!.termsAckPolicyVersion).toBe(1);
    const [hold] = await db.select().from(inventoryHolds).where(eq(inventoryHolds.bookingId, b!.id));
    expect(hold!.quantity).toBe(3);
    expect(await placesInUse(db)).toBe(3);
  });

  it("is idempotent under duplicate clicks: one booking, one hold", async () => {
    const u = await createUser(db);
    const input = bookingInput();
    const results = await Promise.all(Array.from({ length: 6 }, () => createCheckout(deps, u.id, input)));
    expect(new Set(results.map((r) => r.bookingId)).size).toBe(1);
    const all = await db.select().from(bookings);
    expect(all).toHaveLength(1);
    expect(await placesInUse(db)).toBe(2);
  });

  it("reuses an identical pending booking and supersedes a changed one", async () => {
    const u = await createUser(db);
    const first = await createCheckout(deps, u.id, bookingInput());
    const again = await createCheckout(deps, u.id, bookingInput());
    expect(again.bookingId).toBe(first.bookingId);
    const changed = await createCheckout(deps, u.id, bookingInput({ quantityTotal: 4, quantityGirls: 2, quantityBoys: 2 }));
    expect(changed.bookingId).not.toBe(first.bookingId);
    const [old] = await db.select().from(bookings).where(eq(bookings.id, first.bookingId));
    expect(old!.status).toBe("expired");
    expect(await placesInUse(db)).toBe(4);
  });

  it("ignores tampered amounts: the price comes only from settings", async () => {
    const u = await createUser(db);
    const tampered = {
      ...bookingInput({ quantityTotal: 1, quantityGirls: 1, quantityBoys: 0 }),
      totalPaise: 100,
      unitPricePaise: 1,
    };
    const res = await createCheckout(deps, u.id, tampered);
    expect(res.totalPaise).toBe(219_900);
  });

  it("keeps existing bookings' amounts when the price changes later", async () => {
    const u = await createUser(db);
    const res = await createCheckout(deps, u.id, bookingInput({ quantityTotal: 1, quantityGirls: 1, quantityBoys: 0 }));
    await db.update(eventSettings).set({ unitPricePaise: 300_000 }).where(eq(eventSettings.id, "main"));
    const [b] = await db.select().from(bookings).where(eq(bookings.id, res.bookingId));
    expect(b!.totalPaise).toBe(219_900);
    expect((b!.pricingSnapshot as { unitPricePaise: number }).unitPricePaise).toBe(219_900);
  });

  it("enforces verified email, sales window, group size and policy version", async () => {
    const unverified = await createUser(db, { verified: false });
    await expectAppError(createCheckout(deps, unverified.id, bookingInput()), "EMAIL_NOT_VERIFIED");

    const u = await createUser(db);
    await expectAppError(
      createCheckout(deps, u.id, bookingInput({ quantityTotal: 11, quantityGirls: 11, quantityBoys: 0 })),
      "GROUP_TOO_LARGE",
    );
    await expectAppError(createCheckout(deps, u.id, bookingInput({ termsPolicyVersion: 99 })), "POLICY_CHANGED");

    await db
      .update(eventSettings)
      .set({ salesCloseAt: new Date(Date.now() - 1000) })
      .where(eq(eventSettings.id, "main"));
    await expectAppError(createCheckout(deps, u.id, bookingInput()), "SALES_CLOSED");

    await db.update(eventSettings).set({ salesCloseAt: null, salesEnabled: false }).where(eq(eventSettings.id, "main"));
    await expectAppError(createCheckout(deps, u.id, bookingInput()), "SALES_CLOSED");

    await db.update(eventSettings).set({ salesEnabled: true, capacity: null }).where(eq(eventSettings.id, "main"));
    await expectAppError(createCheckout(deps, u.id, bookingInput()), "SALES_CLOSED");
  });
});

describe("capacity under concurrency", () => {
  it("never oversells the last places", async () => {
    await db.update(eventSettings).set({ capacity: 5 }).where(eq(eventSettings.id, "main"));
    const users = await Promise.all(Array.from({ length: 8 }, () => createUser(db)));
    const results = await Promise.allSettled(
      users.map((u) => reserveBooking(deps, u.id, bookingInput({ quantityTotal: 1, quantityGirls: 0, quantityBoys: 1 }))),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(5);
    expect(rejected.every((r) => isAppError(r.reason) && r.reason.code === "NOT_ENOUGH_PLACES")).toBe(true);
    expect(await placesInUse(db)).toBe(5);
  });

  it("releases places when a hold expires (server time) and never double-releases", async () => {
    await db.update(eventSettings).set({ capacity: 2 }).where(eq(eventSettings.id, "main"));
    const a = await createUser(db);
    const b = await createUser(db);
    const first = await reserveBooking(deps, a.id, bookingInput());
    await expectAppError(
      reserveBooking(deps, b.id, bookingInput({ quantityTotal: 1, quantityGirls: 1, quantityBoys: 0 })),
      "NOT_ENOUGH_PLACES",
    );

    await expireHoldNow(db, first.booking.id);
    expect(await placesInUse(db)).toBe(0); // expired holds stop counting immediately
    const second = await reserveBooking(deps, b.id, bookingInput());
    expect(second.booking.status).toBe("pending_payment");

    const r1 = await expireStaleBookings(db);
    const r2 = await expireStaleBookings(db);
    expect(r1.expired).toBe(1);
    expect(r2.expired).toBe(0);
    expect(await placesInUse(db)).toBe(2);
  });
});

describe("coupons", () => {
  it("applies one coupon per order and records attribution", async () => {
    await db.insert(coupons).values({ code: "FRESH10", discountType: "percent", percentOff: 10, perUserLimit: 1 });
    const u = await createUser(db);
    const res = await createCheckout(deps, u.id, bookingInput({ couponCode: "FRESH10" }));
    expect(res.breakdown.discountPaise).toBe(43_980);
    expect(res.totalPaise).toBe(395_820);
    const [b] = await db.select().from(bookings).where(eq(bookings.id, res.bookingId));
    expect(b!.couponCode).toBe("FRESH10");
  });

  it("gives the final redemption to exactly one of many concurrent checkouts", async () => {
    await db
      .insert(coupons)
      .values({ code: "LAST1", discountType: "fixed", amountOffPaise: 10_000, maxRedemptions: 1, perUserLimit: null });
    const users = await Promise.all(Array.from({ length: 6 }, () => createUser(db)));
    const results = await Promise.allSettled(users.map((u) => reserveBooking(deps, u.id, bookingInput({ couponCode: "LAST1" }))));
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    const errors = (results.filter((r) => r.status === "rejected") as PromiseRejectedResult[]).map((r) => r.reason.code);
    expect(errors.every((c) => c === "COUPON_EXHAUSTED")).toBe(true);
  });

  it("enforces the per-user limit and releases reservations on expiry", async () => {
    await db.insert(coupons).values({ code: "ONCE", discountType: "percent", percentOff: 5, perUserLimit: 1, maxRedemptions: 1 });
    const u = await createUser(db);
    const other = await createUser(db);
    const first = await reserveBooking(deps, u.id, bookingInput({ couponCode: "ONCE" }));
    await expectAppError(reserveBooking(deps, other.id, bookingInput({ couponCode: "ONCE" })), "COUPON_EXHAUSTED");
    await expireHoldNow(db, first.booking.id);
    await expireStaleBookings(db);
    const [res] = await db.select().from(couponReservations).where(eq(couponReservations.bookingId, first.booking.id));
    expect(res!.status).toBe("released");
    const second = await reserveBooking(deps, other.id, bookingInput({ couponCode: "ONCE" }));
    expect(second.booking.couponCode).toBe("ONCE");
  });

  it("rejects unknown and expired coupons", async () => {
    await db
      .insert(coupons)
      .values({ code: "OLD", discountType: "percent", percentOff: 5, expiresAt: new Date(Date.now() - 60_000) });
    const u = await createUser(db);
    await expectAppError(reserveBooking(deps, u.id, bookingInput({ couponCode: "NOPE" })), "COUPON_NOT_FOUND");
    await expectAppError(reserveBooking(deps, u.id, bookingInput({ couponCode: "OLD" })), "COUPON_EXPIRED");
  });
});

describe("referral attribution", () => {
  it("attributes without discounting and blocks self-referral", async () => {
    const owner = await createUser(db);
    const [ref] = await db
      .insert(referralCodes)
      .values({ code: "OWNER-1", label: "Owner", ownerType: "user", ownerUserId: owner.id })
      .returning();
    const buyer = await createUser(db);
    const res = await createCheckout(deps, buyer.id, bookingInput({ referralCode: "OWNER-1" }));
    expect(res.breakdown.discountPaise).toBe(0);
    expect(res.totalPaise).toBe(439_800);
    const [b] = await db.select().from(bookings).where(eq(bookings.id, res.bookingId));
    expect(b!.referralCodeId).toBe(ref!.id);
    expect(b!.referralSource).toBe("booking_form");

    await expectAppError(reserveBooking(deps, owner.id, bookingInput({ referralCode: "OWNER-1" })), "SELF_REFERRAL");
  });

  it("falls back to the signup referral and rejects unknown codes", async () => {
    const [ref] = await db.insert(referralCodes).values({ code: "CAMPUS", label: "Campus", ownerType: "campaign" }).returning();
    const u = await createUser(db);
    await db.execute(
      sql`UPDATE "user" SET signup_referral_code = 'CAMPUS', signup_referral_code_id = ${ref!.id} WHERE id = ${u.id}`,
    );
    const res = await reserveBooking(deps, u.id, bookingInput());
    expect(res.booking.referralCode).toBe("CAMPUS");
    expect(res.booking.referralSource).toBe("signup");
    await expectAppError(
      reserveBooking(deps, u.id, bookingInput({ referralCode: "NOT-REAL", idempotencyKey: randomUUID() })),
      "REFERRAL_NOT_FOUND",
    );
  });
});
