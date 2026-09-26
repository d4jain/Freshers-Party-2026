import type { Queryable } from "@/lib/db";
import { bookingEvents } from "@/lib/db/schema";

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
