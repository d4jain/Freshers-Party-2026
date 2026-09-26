import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCheckout, type CheckoutDeps } from "@/lib/booking/checkout";
import { processProofImage, submitPaymentProof } from "@/lib/booking/payment-proof";
import { expireStaleBookings } from "@/lib/booking/reconcile";
import { approveBooking, cancelBooking, rejectBooking } from "@/lib/booking/review";
import { buildStatusView } from "@/lib/booking/status";
import type { DB } from "@/lib/db";
import {
  auditEvents,
  bookings,
  couponReservations,
  coupons,
  emailOutbox,
  eventSettings,
  paymentProofs,
  tickets,
} from "@/lib/db/schema";
import { processEmailOutbox } from "@/lib/email/outbox";
import type { EmailMessage, EmailProvider } from "@/lib/email/provider";
import { isAppError } from "@/lib/errors";
import { normalizeUtr, upiPayLink } from "@/lib/payments/upi";
import { placesInUse } from "@/lib/settings";
import { redeemTicket } from "@/lib/tickets/checkin";
import { createTestDatabase } from "../helpers/db";
import { bookingInput, createUser, expireHoldNow, nextUtr, openSales, screenshotPng } from "../helpers/fixtures";

let db: DB;
let cleanup: () => Promise<void>;
let deps: CheckoutDeps;
let admin: { id: string };

beforeAll(async () => {
  ({ db, cleanup } = await createTestDatabase());
});
afterAll(async () => cleanup());

beforeEach(async () => {
  await db.execute(sql`TRUNCATE bookings, coupons, referral_codes, audit_events, email_outbox, "user" RESTART IDENTITY CASCADE`);
  await db.execute(sql`DELETE FROM event_settings`);
  await openSales(db, { organiserEmail: "organiser@example.test" });
  deps = { db, demo: false, requireVerifiedEmail: true };
  admin = await createUser(db, { role: "admin" });
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

async function newBooking(qty = 2, overrides = {}) {
  const u = await createUser(db);
  const girls = Math.ceil(qty / 2);
  const c = await createCheckout(
    deps,
    u.id,
    bookingInput({ quantityTotal: qty, quantityGirls: girls, quantityBoys: qty - girls, ...overrides }),
  );
  return { user: u, bookingId: c.bookingId, totalPaise: c.totalPaise };
}

async function submit(userId: string, bookingId: string, utr = nextUtr(), seed = 0) {
  return submitPaymentProof(db, { userId, bookingId, utr, payerName: "Riya V", file: await screenshotPng(seed) });
}

async function row(id: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, id));
  return b!;
}
const ticketCount = async (bookingId: string) => (await db.select().from(tickets).where(eq(tickets.bookingId, bookingId))).length;

describe("payment proof submission", () => {
  it("moves the booking to in_review, stores a re-encoded image and keeps the places", async () => {
    const { user, bookingId } = await newBooking(3);
    await submit(user.id, bookingId, " 4265-1234 5678 ");
    const b = await row(bookingId);
    expect(b.status).toBe("in_review");
    expect(b.paymentSubmittedAt).not.toBeNull();
    const [proof] = await db.select().from(paymentProofs).where(eq(paymentProofs.bookingId, bookingId));
    expect(proof!.utr).toBe("426512345678");
    expect(proof!.contentType).toBe("image/jpeg");
    expect(proof!.image.subarray(0, 2).toString("hex")).toBe("ffd8"); // JPEG magic
    expect(proof!.amountPaise).toBe(659_700);
    // Places stay held while in review, even past the original hold time.
    await db.execute(sql`UPDATE bookings SET hold_expires_at = hold_expires_at WHERE id = ${bookingId}`);
    await expireStaleBookings(db);
    expect((await row(bookingId)).status).toBe("in_review");
    expect(await placesInUse(db)).toBe(3);
    expect(await ticketCount(bookingId)).toBe(0);
    const view = await buildStatusView(db, b);
    expect(view.headline).toBe("In review");
  });

  it("alerts the organiser by email when proof arrives", async () => {
    const { user, bookingId } = await newBooking();
    await submit(user.id, bookingId);
    const rows = await db.select().from(emailOutbox).where(eq(emailOutbox.bookingId, bookingId));
    expect(rows.map((r) => [r.kind, r.toEmail])).toEqual([["proof_submitted_admin", "organiser@example.test"]]);
  });

  it("rejects invalid transaction IDs, non-images and oversize files", async () => {
    const { user, bookingId } = await newBooking();
    await expectAppError(
      submitPaymentProof(db, { userId: user.id, bookingId, utr: "12", file: await screenshotPng() }),
      "UTR_INVALID",
    );
    await expectAppError(
      submitPaymentProof(db, { userId: user.id, bookingId, utr: nextUtr(), file: Buffer.from("<script>alert(1)</script>") }),
      "PROOF_INVALID",
    );
    await expectAppError(processProofImage(Buffer.alloc(9 * 1024 * 1024)), "PROOF_TOO_LARGE");
    expect((await row(bookingId)).status).toBe("pending_payment");
  });

  it("does not let one user submit proof for another user's booking", async () => {
    const { bookingId } = await newBooking();
    const other = await createUser(db);
    await expectAppError(submit(other.id, bookingId), "NOT_FOUND");
  });

  it("blocks re-using a transaction ID on another booking and double submission", async () => {
    const a = await newBooking();
    const b = await newBooking();
    const utr = nextUtr();
    await submit(a.user.id, a.bookingId, utr);
    await expectAppError(submit(b.user.id, b.bookingId, utr), "UTR_USED");
    await expectAppError(submit(a.user.id, a.bookingId), "ALREADY_SUBMITTED");
  });

  it("allows a transaction ID again once the booking that used it was rejected", async () => {
    const a = await newBooking();
    const utr = nextUtr();
    await submit(a.user.id, a.bookingId, utr);
    await rejectBooking(db, { adminId: admin.id, bookingId: a.bookingId, reason: "Wrong amount paid" });
    const b = await newBooking();
    await submit(b.user.id, b.bookingId, utr);
    expect((await row(b.bookingId)).status).toBe("in_review");
  });

  it("accepts late proof after the hold lapsed only if places remain", async () => {
    await db.update(eventSettings).set({ capacity: 2 }).where(eq(eventSettings.id, "main"));
    const late = await newBooking(2);
    await expireHoldNow(db, late.bookingId);
    await expireStaleBookings(db);
    expect((await row(late.bookingId)).status).toBe("expired");
    await submit(late.user.id, late.bookingId);
    expect((await row(late.bookingId)).status).toBe("in_review");

    // The in-review booking now holds the places again.
    const other = await newBooking(1).catch((e) => e);
    expect(isAppError(other) && other.code).toBe("NOT_ENOUGH_PLACES");
  });

  it("refuses late proof when the places were taken meanwhile", async () => {
    await db.update(eventSettings).set({ capacity: 2 }).where(eq(eventSettings.id, "main"));
    const first = await newBooking(2);
    await expireHoldNow(db, first.bookingId);
    const second = await newBooking(2); // takes the freed places
    await submit(second.user.id, second.bookingId);
    await expectAppError(submit(first.user.id, first.bookingId), "NO_PLACES");
  });
});

describe("organiser review", () => {
  it("approval confirms, commits the coupon, issues one pass per person and queues the email", async () => {
    await db.insert(coupons).values({ code: "FRESH10", discountType: "percent", percentOff: 10, maxRedemptions: 5 });
    const { user, bookingId } = await newBooking(3, { couponCode: "FRESH10" });
    await submit(user.id, bookingId);
    const r = await approveBooking(db, { adminId: admin.id, bookingId, note: "Seen in PhonePe" });
    expect(r.outcome).toBe("confirmed");
    const b = await row(bookingId);
    expect(b.status).toBe("confirmed");
    expect(b.reviewedBy).toBe(admin.id);
    expect(await ticketCount(bookingId)).toBe(3);
    const [res] = await db.select().from(couponReservations).where(eq(couponReservations.bookingId, bookingId));
    expect(res!.status).toBe("committed");
    const mail = await db.select().from(emailOutbox).where(eq(emailOutbox.kind, "booking_confirmation"));
    expect(mail).toHaveLength(1);
    const audit = await db.select().from(auditEvents).where(eq(auditEvents.action, "booking.approve"));
    expect(audit).toHaveLength(1);
  });

  it("issues passes exactly once when two organisers approve at the same time", async () => {
    const { user, bookingId } = await newBooking(4);
    await submit(user.id, bookingId);
    const results = await Promise.allSettled([1, 2, 3, 4].map(() => approveBooking(db, { adminId: admin.id, bookingId })));
    const outcomes = results.map((r) => (r.status === "fulfilled" ? r.value.outcome : "error"));
    expect(outcomes.filter((o) => o === "confirmed")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "already_confirmed")).toHaveLength(3);
    expect(await ticketCount(bookingId)).toBe(4);
  });

  it("cannot approve a booking without proof", async () => {
    const { bookingId } = await newBooking();
    await expectAppError(approveBooking(db, { adminId: admin.id, bookingId }), "NOT_IN_REVIEW");
    expect(await ticketCount(bookingId)).toBe(0);
  });

  it("rejection releases places and coupon use, needs a reason, and is shown to the buyer", async () => {
    await db
      .insert(coupons)
      .values({ code: "ONE", discountType: "fixed", amountOffPaise: 10_000, maxRedemptions: 1, perUserLimit: null });
    const a = await newBooking(2, { couponCode: "ONE" });
    await submit(a.user.id, a.bookingId);
    await expectAppError(rejectBooking(db, { adminId: admin.id, bookingId: a.bookingId, reason: "no" }), "REASON_REQUIRED");
    await rejectBooking(db, { adminId: admin.id, bookingId: a.bookingId, reason: "No payment found for this UTR" });
    const b = await row(a.bookingId);
    expect(b.status).toBe("rejected");
    expect(await placesInUse(db)).toBe(0);
    const view = await buildStatusView(db, b);
    expect(view.reviewNote).toBe("No payment found for this UTR");
    // The coupon use is free again.
    const next = await newBooking(1, { couponCode: "ONE" });
    expect(next.totalPaise).toBe(209_900);
    await expectAppError(approveBooking(db, { adminId: admin.id, bookingId: a.bookingId }), "NOT_IN_REVIEW");
  });

  it("cancelling a confirmed booking voids its passes at the door", async () => {
    const { user, bookingId } = await newBooking(2);
    await submit(user.id, bookingId);
    await approveBooking(db, { adminId: admin.id, bookingId });
    await cancelBooking(db, { adminId: admin.id, bookingId, reason: "Refunded via UPI on request" });
    expect((await row(bookingId)).status).toBe("cancelled");
    const [t] = await db.select().from(tickets).where(eq(tickets.bookingId, bookingId));
    const staff = await createUser(db, { role: "staff" });
    expect((await redeemTicket(db, { staffUserId: staff.id, ticketId: t!.id, demoAllowed: false })).state).toBe("void");
  });

  it("expires bookings that never submitted proof and frees their places", async () => {
    const { bookingId } = await newBooking(2);
    await expireHoldNow(db, bookingId);
    const r = await expireStaleBookings(db);
    expect(r.expired).toBe(1);
    expect((await row(bookingId)).status).toBe("expired");
    expect(await placesInUse(db)).toBe(0);
    expect((await expireStaleBookings(db)).expired).toBe(0);
  });
});

describe("emails", () => {
  it("sends the confirmation after approval and survives a provider outage", async () => {
    const { user, bookingId } = await newBooking();
    await submit(user.id, bookingId);
    await approveBooking(db, { adminId: admin.id, bookingId });
    const sent: EmailMessage[] = [];
    let down = true;
    const provider: EmailProvider = {
      name: "test",
      async send(m) {
        if (down) return { ok: false, error: "503", retryable: true };
        sent.push(m);
        return { ok: true, providerMessageId: "msg_1" };
      },
    };
    await processEmailOutbox(db, { appUrl: "http://localhost:3000", provider });
    expect((await row(bookingId)).status).toBe("confirmed");
    down = false;
    await db.execute(sql`UPDATE email_outbox SET next_attempt_at = now()`);
    await processEmailOutbox(db, { appUrl: "http://localhost:3000", provider });
    const confirmation = sent.find((m) => m.subject.includes("You’re in"));
    expect(confirmation?.text).toContain("verified by the organisers");
    expect(confirmation?.text).toContain("From 7:00 am IST");
    expect(sent.some((m) => m.subject.startsWith("[Review]"))).toBe(false); // stale admin alert dropped after approval
  });
});

describe("UPI helpers", () => {
  it("normalises transaction IDs", () => {
    expect(normalizeUtr(" 4265 1234-5678 ")).toBe("426512345678");
    expect(normalizeUtr("t2409261234abcd")).toBe("T2409261234ABCD");
    expect(normalizeUtr("12")).toBeNull();
    expect(normalizeUtr("abc$%^def")).toBeNull();
  });
  it("builds a upi:// link with the exact amount and booking reference", () => {
    const link = upiPayLink({
      upiId: "63968583011@axl",
      payeeName: "ABHIRAKSHIT GAUR",
      amountPaise: 439_800,
      reference: "FP26-ABCD2345",
    });
    const u = new URL(link);
    expect(u.protocol).toBe("upi:");
    expect(u.searchParams.get("pa")).toBe("63968583011@axl");
    expect(u.searchParams.get("am")).toBe("4398.00");
    expect(u.searchParams.get("cu")).toBe("INR");
    expect(u.searchParams.get("tn")).toContain("FP26-ABCD2345");
  });
});
