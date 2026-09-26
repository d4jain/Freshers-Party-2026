import { eq, sql } from "drizzle-orm";
import {
  DEFAULT_HOLD_MINUTES,
  DEFAULT_MAX_GROUP_SIZE,
  DEMO_CAPACITY,
  EVENT_DAY_END_ISO,
  EVENT_FACTS,
  PRICING_DEFAULTS,
} from "@/config/event";
import type { Queryable } from "@/lib/db";
import { eventSettings, type EventSettingsRow } from "@/lib/db/schema";
import type { PaymentMode } from "@/lib/payments/types";

export type EventSettings = EventSettingsRow;

export function defaultSettingsValues() {
  return {
    id: "main",
    eventName: EVENT_FACTS.name,
    eventDate: EVENT_FACTS.eventDate,
    timezone: EVENT_FACTS.timezone,
    venueName: EVENT_FACTS.venueName,
    venueBranch: EVENT_FACTS.venueBranch,
    venueAddress: EVENT_FACTS.venueAddress,
    venueWebsite: EVENT_FACTS.venueWebsite,
    venueMapUrl: null,
    currency: PRICING_DEFAULTS.currency,
    unitPricePaise: PRICING_DEFAULTS.unitPricePaise,
    compareAtPricePaise: PRICING_DEFAULTS.compareAtPricePaise,
    bookingFeePaise: PRICING_DEFAULTS.bookingFeePaise,
    maxGroupSize: DEFAULT_MAX_GROUP_SIZE,
    holdMinutes: DEFAULT_HOLD_MINUTES,
    whatsappGroupUrl: EVENT_FACTS.whatsappGroupUrl,
  } satisfies typeof eventSettings.$inferInsert;
}

/** Read-only fallback used by public pages when the database is unreachable. */
export function fallbackSettings(): EventSettings {
  const now = new Date(0);
  return {
    ...defaultSettingsValues(),
    startsAt: null,
    endsAt: null,
    bookingFeeLabel: null,
    capacity: null,
    salesOpenAt: null,
    salesCloseAt: null,
    offerExpiresAt: null,
    salesEnabled: false,
    organiserName: null,
    organiserPhone: null,
    organiserWhatsapp: null,
    organiserEmail: null,
    organiserInstagram: null,
    drinksDetails: null,
    termsText: null,
    privacyText: null,
    refundPolicyText: null,
    policyVersion: 1,
    policiesApproved: false,
    approvedMedia: [],
    heroVideo: null,
    version: 0,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Loads the singleton settings row, creating it from defaults on first use. */
export async function getSettings(db: Queryable): Promise<EventSettings> {
  const rows = await db.select().from(eventSettings).where(eq(eventSettings.id, "main")).limit(1);
  if (rows[0]) return rows[0];
  await db.insert(eventSettings).values(defaultSettingsValues()).onConflictDoNothing();
  const again = await db.select().from(eventSettings).where(eq(eventSettings.id, "main")).limit(1);
  return again[0]!;
}

/**
 * Takes the inventory lock. Every path that reserves or confirms places
 * locks this row first, so capacity checks are serialised and consistent.
 */
export async function lockSettingsForUpdate(tx: Queryable): Promise<EventSettings> {
  await getSettings(tx);
  const rows = await tx.select().from(eventSettings).where(eq(eventSettings.id, "main")).for("update");
  return rows[0]!;
}

export function effectiveCapacity(settings: EventSettings, isDemo: boolean): number | null {
  if (settings.capacity != null) return settings.capacity;
  return isDemo ? DEMO_CAPACITY : null;
}

export function eventEndsAt(settings: EventSettings): Date {
  return settings.endsAt ?? new Date(EVENT_DAY_END_ISO);
}

export type SalesState =
  { open: true; isDemo: boolean; capacity: number } | { open: false; reason: string; code: SalesClosedCode; setupHint?: string };

export type SalesClosedCode =
  | "PAYMENTS_DISABLED"
  | "SALES_DISABLED"
  | "CAPACITY_NOT_SET"
  | "POLICIES_NOT_APPROVED"
  | "NOT_OPEN_YET"
  | "CLOSED"
  | "EVENT_OVER";

export function evaluateSales(settings: EventSettings, mode: PaymentMode, now: Date): SalesState {
  if (mode.kind === "disabled") {
    return { open: false, code: "PAYMENTS_DISABLED", reason: mode.reason, setupHint: mode.setupHint };
  }
  const isDemo = mode.kind === "demo";
  if (now >= eventEndsAt(settings)) return { open: false, code: "EVENT_OVER", reason: "This event has ended." };
  if (settings.salesOpenAt && now < settings.salesOpenAt) {
    return { open: false, code: "NOT_OPEN_YET", reason: "Bookings haven’t opened yet." };
  }
  if (settings.salesCloseAt && now >= settings.salesCloseAt) {
    return { open: false, code: "CLOSED", reason: "Bookings are closed." };
  }
  const capacity = effectiveCapacity(settings, isDemo);
  if (!isDemo) {
    if (!settings.salesEnabled) {
      return {
        open: false,
        code: "SALES_DISABLED",
        reason: "Online booking isn’t live yet.",
        setupHint: "Organisers: enable sales in Admin → Settings once capacity and policies are confirmed.",
      };
    }
    if (!settings.policiesApproved) {
      return {
        open: false,
        code: "POLICIES_NOT_APPROVED",
        reason: "Online booking isn’t live yet.",
        setupHint: "Organisers: add and approve the terms, privacy and refund policy text in Admin → Settings.",
      };
    }
  }
  if (capacity == null) {
    return {
      open: false,
      code: "CAPACITY_NOT_SET",
      reason: "Online booking isn’t live yet.",
      setupHint: "Organisers: set the event capacity in Admin → Settings.",
    };
  }
  return { open: true, isDemo, capacity };
}

/** Places counted against capacity: confirmed bookings + live (unexpired, active) holds. */
export async function placesInUse(tx: Queryable, excludeBookingId?: string): Promise<number> {
  const exclude = excludeBookingId ?? "00000000-0000-0000-0000-000000000000";
  const res = await tx.execute<{ used: string }>(sql`
    SELECT
      (SELECT coalesce(sum(quantity_total), 0) FROM bookings WHERE status = 'confirmed')
      + (SELECT coalesce(sum(quantity), 0) FROM inventory_holds
          WHERE status = 'active' AND expires_at > now() AND booking_id <> ${exclude}::uuid)
      AS used
  `);
  return Number(res.rows[0]?.used ?? 0);
}
