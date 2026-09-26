import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCheckout } from "@/lib/booking/checkout";
import { submitPaymentProof } from "@/lib/booking/payment-proof";
import { approveBooking } from "@/lib/booking/review";
import type { DB } from "@/lib/db";
import { auditEvents, checkInEvents, tickets } from "@/lib/db/schema";
import { lookupTicket, redeemTicket, voidTicket } from "@/lib/tickets/checkin";
import { formatManualCode, newPublicId, qrPayloadFor } from "@/lib/tickets/token";
import { createTestDatabase } from "../helpers/db";
import { bookingInput, createUser, nextUtr, openSales, screenshotPng } from "../helpers/fixtures";

const SECRET = "checkin-test-secret";
let db: DB;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDatabase());
});
afterAll(async () => cleanup());
beforeEach(async () => {
  await db.execute(sql`TRUNCATE bookings, check_in_events, audit_events, "user" RESTART IDENTITY CASCADE`);
  await db.execute(sql`DELETE FROM event_settings`);
  await openSales(db);
});

async function payAndApprove(userId: string, bookingId: string) {
  await submitPaymentProof(db, { userId, bookingId, utr: nextUtr(), file: await screenshotPng() });
  const organiser = await createUser(db, { role: "admin" });
  await approveBooking(db, { adminId: organiser.id, bookingId });
}

async function confirmedTickets(qty = 2) {
  const u = await createUser(db, { name: "Kabir Mehta" });
  const c = await createCheckout(
    { db, demo: false, requireVerifiedEmail: true },
    u.id,
    bookingInput({ quantityTotal: qty, quantityGirls: 0, quantityBoys: qty, bookerName: "Kabir Mehta" }),
  );
  await payAndApprove(u.id, c.bookingId);
  return db.select().from(tickets).where(eq(tickets.bookingId, c.bookingId));
}

describe("check-in", () => {
  it("looks up by signed QR or manual code and shows minimal data", async () => {
    const [t] = await confirmedTickets();
    const byQr = await lookupTicket(db, SECRET, qrPayloadFor(SECRET, t!.publicId), false);
    expect(byQr.state).toBe("valid");
    expect(byQr.holderFirstName).toBe("Kabir");
    expect(byQr).not.toHaveProperty("email");
    expect(byQr).not.toHaveProperty("phone");
    const byCode = await lookupTicket(db, SECRET, formatManualCode(t!.manualCode).toLowerCase(), false);
    expect(byCode.ticketId).toBe(t!.id);
  });

  it("rejects forged QR codes and unknown codes", async () => {
    await confirmedTickets();
    expect((await lookupTicket(db, SECRET, qrPayloadFor("wrong-secret", newPublicId()), false)).state).toBe("invalid_code");
    expect((await lookupTicket(db, SECRET, qrPayloadFor(SECRET, newPublicId()), false)).state).toBe("not_found");
    expect((await lookupTicket(db, SECRET, "ZZZZZ-ZZZZZ", false)).state).toBe("not_found");
  });

  it("admits exactly once under concurrent scans and reports the original timestamp", async () => {
    const [t] = await confirmedTickets();
    const staff = await createUser(db, { role: "staff" });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => redeemTicket(db, { staffUserId: staff.id, ticketId: t!.id, demoAllowed: false })),
    );
    const admitted = results.filter((r) => r.state === "valid");
    const repeats = results.filter((r) => r.state === "already_checked_in");
    expect(admitted).toHaveLength(1);
    expect(repeats).toHaveLength(7);
    const [row] = await db.select().from(tickets).where(eq(tickets.id, t!.id));
    expect(repeats.every((r) => r.checkedInAt === row!.checkedInAt!.toISOString())).toBe(true);
    const events = await db.select().from(checkInEvents);
    expect(events.filter((e) => e.result === "admitted")).toHaveLength(1);
    const audits = await db.select().from(auditEvents).where(eq(auditEvents.action, "ticket.check_in"));
    expect(audits).toHaveLength(1);
  });

  it("rejects voided passes", async () => {
    const [t] = await confirmedTickets();
    const admin = await createUser(db, { role: "admin" });
    expect(await voidTicket(db, { actorUserId: admin.id, ticketId: t!.id, reason: "partial refund" })).toBe(true);
    const res = await redeemTicket(db, { staffUserId: admin.id, ticketId: t!.id, demoAllowed: false });
    expect(res.state).toBe("void");
  });

  it("rejects demo passes unless demo mode is active", async () => {
    const u = await createUser(db);
    const c = await createCheckout({ db, demo: true, requireVerifiedEmail: true }, u.id, bookingInput());
    await payAndApprove(u.id, c.bookingId);
    const [t] = await db.select().from(tickets).where(eq(tickets.bookingId, c.bookingId));
    expect(t!.isDemo).toBe(true);
    const staff = await createUser(db, { role: "staff" });
    expect((await redeemTicket(db, { staffUserId: staff.id, ticketId: t!.id, demoAllowed: false })).state).toBe("demo_pass");
  });
});
