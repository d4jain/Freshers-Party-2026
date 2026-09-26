import { and, eq, sql } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";
import type { DB } from "@/lib/db";
import { bookings, checkInEvents, tickets } from "@/lib/db/schema";
import { normalizeManualCode, parseQrPayload } from "./token";

export type TicketLookupState =
  "valid" | "already_checked_in" | "void" | "booking_not_confirmed" | "demo_pass" | "not_found" | "invalid_code";

/** The minimum a door volunteer needs. No phone, email or payment data. */
export type TicketLookup = {
  state: TicketLookupState;
  ticketId?: string;
  reference?: string;
  holderFirstName?: string;
  ticketIndex?: number;
  ticketsInBooking?: number;
  checkedInAt?: string | null;
};

function firstName(full: string) {
  return full.trim().split(/\s+/)[0] ?? "";
}

async function findTicket(db: DB, secret: string, code: string) {
  const trimmed = code.trim();
  if (trimmed.startsWith("FP26.")) {
    const parsed = parseQrPayload(secret, trimmed);
    if (!parsed) return { invalid: true as const };
    const rows = await db
      .select({ t: tickets, b: bookings })
      .from(tickets)
      .innerJoin(bookings, eq(bookings.id, tickets.bookingId))
      .where(eq(tickets.publicId, parsed.publicId))
      .limit(1);
    return { row: rows[0] };
  }
  const manual = normalizeManualCode(trimmed);
  if (!manual) return { invalid: true as const };
  const rows = await db
    .select({ t: tickets, b: bookings })
    .from(tickets)
    .innerJoin(bookings, eq(bookings.id, tickets.bookingId))
    .where(eq(tickets.manualCode, manual))
    .limit(1);
  return { row: rows[0] };
}

function describe(row: { t: typeof tickets.$inferSelect; b: typeof bookings.$inferSelect }, demoAllowed: boolean): TicketLookup {
  const base = {
    ticketId: row.t.id,
    reference: row.b.reference,
    holderFirstName: firstName(row.b.bookerName),
    ticketIndex: row.t.ticketIndex,
    ticketsInBooking: row.b.quantityTotal,
    checkedInAt: row.t.checkedInAt ? row.t.checkedInAt.toISOString() : null,
  };
  if (row.t.isDemo && !demoAllowed) return { state: "demo_pass", ...base };
  if (row.t.status === "void") return { state: "void", ...base };
  if (row.b.status !== "confirmed") return { state: "booking_not_confirmed", ...base };
  if (row.t.checkedInAt) return { state: "already_checked_in", ...base };
  return { state: "valid", ...base };
}

export async function lookupTicket(db: DB, secret: string, code: string, demoAllowed: boolean): Promise<TicketLookup> {
  const found = await findTicket(db, secret, code);
  if ("invalid" in found) return { state: "invalid_code" };
  if (!found.row) return { state: "not_found" };
  return describe(found.row, demoAllowed);
}

/**
 * Redeems once, atomically: the UPDATE only matches an unused, valid ticket
 * on a confirmed booking. Concurrent scans race on the row; exactly one wins,
 * the rest see "already checked in" with the original timestamp.
 */
export async function redeemTicket(
  db: DB,
  opts: { staffUserId: string; ticketId: string; demoAllowed: boolean },
): Promise<TicketLookup> {
  const redeemed = await db.execute<{ id: string }>(sql`
    UPDATE tickets t SET checked_in_at = now(), checked_in_by = ${opts.staffUserId}
    FROM bookings b
    WHERE t.id = ${opts.ticketId}
      AND b.id = t.booking_id
      AND b.status = 'confirmed'
      AND t.status = 'valid'
      AND t.checked_in_at IS NULL
      AND (t.is_demo = false OR ${opts.demoAllowed})
    RETURNING t.id
  `);

  const rows = await db
    .select({ t: tickets, b: bookings })
    .from(tickets)
    .innerJoin(bookings, eq(bookings.id, tickets.bookingId))
    .where(eq(tickets.id, opts.ticketId))
    .limit(1);
  const row = rows[0];
  const won = redeemed.rows.length === 1;
  const result: TicketLookup = row ? describe(row, opts.demoAllowed) : { state: "not_found" };
  const final: TicketLookup = won ? { ...result, state: "valid" } : result;

  await db.insert(checkInEvents).values({
    ticketId: row ? row.t.id : null,
    staffUserId: opts.staffUserId,
    action: "redeem",
    result: won ? "admitted" : final.state,
  });
  if (won) {
    await recordAudit(db, {
      actorUserId: opts.staffUserId,
      action: "ticket.check_in",
      targetType: "ticket",
      targetId: opts.ticketId,
      details: { reference: row?.b.reference, ticketIndex: row?.t.ticketIndex },
    });
  }
  return won ? { ...final, state: "valid", checkedInAt: row?.t.checkedInAt?.toISOString() ?? null } : final;
}

/** Organiser action (audited) — e.g. after a partial refund. Never re-validates a void pass. */
export async function voidTicket(db: DB, opts: { actorUserId: string; ticketId: string; reason: string }) {
  const [t] = await db
    .update(tickets)
    .set({ status: "void", voidReason: opts.reason.slice(0, 200), voidedAt: new Date() })
    .where(and(eq(tickets.id, opts.ticketId), eq(tickets.status, "valid")))
    .returning();
  if (t) {
    await recordAudit(db, {
      actorUserId: opts.actorUserId,
      action: "ticket.void",
      targetType: "ticket",
      targetId: t.id,
      details: { bookingId: t.bookingId, ticketIndex: t.ticketIndex, reason: opts.reason },
    });
  }
  return Boolean(t);
}
