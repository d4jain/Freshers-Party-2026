import type { Queryable } from "@/lib/db";
import { bookingEvents, bookingExceptions } from "@/lib/db/schema";

export async function logBookingEvent(
  db: Queryable,
  bookingId: string,
  fromStatus: string | null,
  toStatus: string | null,
  source: string,
  note?: string,
) {
  await db.insert(bookingEvents).values({ bookingId, fromStatus, toStatus, source, note });
}

export type ExceptionKind = (typeof bookingExceptions.$inferInsert)["kind"];

export async function raiseException(
  db: Queryable,
  input: { bookingId: string | null; kind: ExceptionKind; dedupeKey: string; details?: Record<string, unknown> },
) {
  await db
    .insert(bookingExceptions)
    .values({ bookingId: input.bookingId, kind: input.kind, dedupeKey: input.dedupeKey, details: input.details ?? {} })
    .onConflictDoNothing({ target: bookingExceptions.dedupeKey });
}
