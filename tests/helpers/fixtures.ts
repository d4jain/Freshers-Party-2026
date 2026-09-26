import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { eventSettings, user } from "@/lib/db/schema";
import sharp from "sharp";
import { getSettings } from "@/lib/settings";
import type { BookingRequest } from "@/lib/validation";

export async function createUser(db: DB, opts: { verified?: boolean; role?: "user" | "staff" | "admin"; name?: string } = {}) {
  const id = randomUUID().replace(/-/g, "");
  const email = `user_${id.slice(0, 10)}@example.test`;
  await db.insert(user).values({
    id,
    name: opts.name ?? "Aarav Sharma",
    email,
    emailVerified: opts.verified ?? true,
    phone: "+919876543210",
    role: opts.role ?? "user",
  });
  return { id, email };
}

/** Puts the event into a sellable state for tests. */
export async function openSales(db: DB, patch: Partial<typeof eventSettings.$inferInsert> = {}) {
  await getSettings(db);
  await db
    .update(eventSettings)
    .set({ capacity: 100, salesEnabled: true, policiesApproved: true, ...patch })
    .where(eq(eventSettings.id, "main"));
}

export function bookingInput(overrides: Partial<BookingRequest> = {}): BookingRequest {
  return {
    quantityTotal: 2,
    quantityGirls: 1,
    quantityBoys: 1,
    couponCode: null,
    referralCode: null,
    bookerName: "Aarav Sharma",
    bookerPhone: "+919876543210",
    bookerEmail: "aarav@example.test",
    eligibilityAck: true,
    termsAck: true,
    termsPolicyVersion: 1,
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

/** A real (tiny) PNG screenshot for proof uploads. */
export async function screenshotPng(seed = 0): Promise<Buffer> {
  return sharp({
    create: { width: 40, height: 60, channels: 3, background: { r: (seed * 37) % 256, g: 120, b: 200 } },
  })
    .png()
    .toBuffer();
}

let utrCounter = 100000000000;
export function nextUtr() {
  utrCounter += Math.floor(Math.random() * 1000) + 1;
  return String(utrCounter);
}

/** Moves a booking's hold into the past (simulates time passing on the server). */
export async function expireHoldNow(db: DB, bookingId: string) {
  await db.execute(sql`UPDATE inventory_holds SET expires_at = now() - interval '1 minute' WHERE booking_id = ${bookingId}`);
  await db.execute(sql`UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = ${bookingId}`);
  await db.execute(sql`UPDATE coupon_reservations SET expires_at = now() - interval '1 minute' WHERE booking_id = ${bookingId}`);
}
