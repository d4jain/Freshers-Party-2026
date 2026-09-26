import { eq, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { bookings, emailOutbox } from "@/lib/db/schema";
import { getSettings } from "@/lib/settings";
import { getEmailProvider, type EmailProvider } from "./provider";
import { bookingConfirmationEmail } from "./templates";

const MAX_ATTEMPTS = 8;

/**
 * Claims due messages with FOR UPDATE SKIP LOCKED so concurrent workers never
 * send the same row twice, then sends outside the claim transaction. A stuck
 * "sending" row is reclaimed after 10 minutes. Email failures never touch
 * booking state.
 */
export async function processEmailOutbox(
  db: DB,
  opts: { appUrl: string; provider?: EmailProvider | null; limit?: number; onlyBookingId?: string },
) {
  const provider = opts.provider === undefined ? getEmailProvider() : opts.provider;
  if (!provider) return { sent: 0, failed: 0, skipped: "no_provider" as const };

  const filter = opts.onlyBookingId ? sql`AND booking_id = ${opts.onlyBookingId}` : sql``;
  const claimed = await db.execute<{ id: string }>(sql`
    UPDATE email_outbox SET status = 'sending', locked_at = now(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM email_outbox
      WHERE ((status = 'pending' AND next_attempt_at <= now())
          OR (status = 'sending' AND locked_at < now() - interval '10 minutes'))
        ${filter}
      ORDER BY next_attempt_at
      LIMIT ${opts.limit ?? 20}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);

  let sent = 0;
  let failed = 0;
  const settings = claimed.rows.length ? await getSettings(db) : null;

  for (const { id } of claimed.rows) {
    const [msg] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id));
    if (!msg) continue;
    try {
      if (msg.kind !== "booking_confirmation" || !msg.bookingId) throw new Error(`Unknown email kind ${msg.kind}`);
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, msg.bookingId));
      if (!booking || booking.status !== "confirmed") {
        await db
          .update(emailOutbox)
          .set({ status: "failed", lastError: "Booking is no longer confirmed" })
          .where(eq(emailOutbox.id, id));
        continue;
      }
      const content = bookingConfirmationEmail({ booking, settings: settings!, appUrl: opts.appUrl });
      const res = await provider.send({ ...content, to: msg.toEmail, idempotencyKey: msg.dedupeKey });
      if (res.ok) {
        await db
          .update(emailOutbox)
          .set({ status: "sent", sentAt: new Date(), providerMessageId: res.providerMessageId, lastError: null, lockedAt: null })
          .where(eq(emailOutbox.id, id));
        sent++;
      } else {
        const giveUp = !res.retryable || msg.attempts >= MAX_ATTEMPTS;
        await db
          .update(emailOutbox)
          .set({
            status: giveUp ? "failed" : "pending",
            lastError: res.error.slice(0, 500),
            lockedAt: null,
            nextAttemptAt: sql`now() + make_interval(mins => ${Math.min(60, 2 ** msg.attempts)})`,
          })
          .where(eq(emailOutbox.id, id));
        failed++;
      }
    } catch (e) {
      await db
        .update(emailOutbox)
        .set({
          status: msg.attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          lastError: (e instanceof Error ? e.message : "error").slice(0, 500),
          lockedAt: null,
          nextAttemptAt: sql`now() + make_interval(mins => ${Math.min(60, 2 ** msg.attempts)})`,
        })
        .where(eq(emailOutbox.id, id));
      failed++;
    }
  }
  return { sent, failed };
}

/** Organiser "resend": a new outbox row with its own dedupe key. */
export async function enqueueResend(db: DB, bookingId: string, toEmail: string) {
  await db.insert(emailOutbox).values({
    kind: "booking_confirmation",
    bookingId,
    toEmail,
    dedupeKey: `booking_confirmation:${bookingId}:resend:${Date.now()}`,
  });
}
