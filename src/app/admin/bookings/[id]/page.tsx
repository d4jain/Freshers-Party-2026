import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  approveBookingAction,
  cancelBookingAction,
  rejectBookingAction,
  resendConfirmation,
  voidTicketAction,
} from "@/app/admin/actions";
import { StatusChip } from "@/components/account/status-chip";
import { ActionForm } from "@/components/admin/action-form";
import { OrderSummary } from "@/components/booking/order-summary";
import { getDb } from "@/lib/db";
import { bookingEvents, bookings, emailOutbox, paymentProofs, tickets } from "@/lib/db/schema";
import { formatDateTimeIST } from "@/lib/format";
import { formatINR } from "@/lib/money";
import type { PriceBreakdown } from "@/lib/pricing";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="break-words text-ivory">{children}</dd>
    </div>
  );
}

export default async function AdminBookingDetail(props: PageProps<"/admin/bookings/[id]">) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  if (!b) notFound();
  const [proofs, ts, events, emails] = await Promise.all([
    db
      .select({
        utr: paymentProofs.utr,
        payerName: paymentProofs.payerName,
        amountPaise: paymentProofs.amountPaise,
        submittedAt: paymentProofs.submittedAt,
        sizeBytes: paymentProofs.sizeBytes,
      })
      .from(paymentProofs)
      .where(eq(paymentProofs.bookingId, id)),
    db.select().from(tickets).where(eq(tickets.bookingId, id)).orderBy(asc(tickets.ticketIndex)),
    db.select().from(bookingEvents).where(eq(bookingEvents.bookingId, id)).orderBy(desc(bookingEvents.createdAt)),
    db.select().from(emailOutbox).where(eq(emailOutbox.bookingId, id)).orderBy(desc(emailOutbox.createdAt)),
  ]);

  return (
    <div className="space-y-8">
      <Link href="/admin/bookings" className="text-sm font-semibold text-gold">
        ← All bookings
      </Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl text-ivory">{b.reference}</h1>
        <StatusChip status={b.status} />
        {b.isDemo && (
          <span className="rounded-full border border-dashed border-danger/60 px-2 py-0.5 text-xs font-bold text-danger">
            DEMO
          </span>
        )}
      </header>
      {b.statusReason && <p className="text-sm text-mist">Reason: {b.statusReason}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5" aria-labelledby="booker">
          <h2 id="booker" className="mb-3 font-display text-2xl text-ivory">
            Booker & attribution
          </h2>
          <dl>
            <Row label="Name">{b.bookerName}</Row>
            <Row label="Phone">{b.bookerPhone}</Row>
            <Row label="Email">{b.bookerEmail}</Row>
            <Row label="People">
              {b.quantityTotal} ({b.quantityGirls} girls, {b.quantityBoys} boys)
            </Row>
            <Row label="Coupon">{b.couponCode ?? "—"}</Row>
            <Row label="Referral">{b.referralCode ? `${b.referralCode} (${b.referralSource})` : "—"}</Row>
            <Row label="Eligibility ack">
              {formatDateTimeIST(b.eligibilityAckAt)} · {b.eligibilityAckVersion}
            </Row>
            <Row label="Terms ack">
              {formatDateTimeIST(b.termsAckAt)} · policy v{b.termsAckPolicyVersion}
            </Row>
            <Row label="Created">{formatDateTimeIST(b.createdAt)}</Row>
            <Row label="Hold expires">{formatDateTimeIST(b.holdExpiresAt)}</Row>
            {b.confirmedAt && <Row label="Confirmed">{formatDateTimeIST(b.confirmedAt)}</Row>}
            {b.paymentSubmittedAt && <Row label="Proof submitted">{formatDateTimeIST(b.paymentSubmittedAt)}</Row>}
            {b.reviewedAt && <Row label="Reviewed">{formatDateTimeIST(b.reviewedAt)}</Row>}
            {b.reviewNote && <Row label="Review note">{b.reviewNote}</Row>}
          </dl>
        </section>
        <section className="card p-5" aria-labelledby="pricing">
          <h2 id="pricing" className="mb-3 font-display text-2xl text-ivory">
            Price snapshot
          </h2>
          <OrderSummary breakdown={b.pricingSnapshot as PriceBreakdown} girls={b.quantityGirls} boys={b.quantityBoys} />
          <p className="mt-3 text-xs text-muted">
            Snapshot from settings v{b.settingsVersion}. Later price changes don’t affect this booking.
          </p>
        </section>
      </div>

      <section className="card space-y-4 p-5" aria-labelledby="payment">
        <h2 id="payment" className="font-display text-2xl text-ivory">
          Payment proof
        </h2>
        {proofs[0] ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,18rem)_1fr]">
            <a
              href={`/api/bookings/${b.id}/proof`}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-xl border border-gold/20"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- private, authenticated image */}
              <img
                src={`/api/bookings/${b.id}/proof`}
                alt={`Payment screenshot for ${b.reference}`}
                className="max-h-96 w-full object-contain"
              />
            </a>
            <dl>
              <Row label="UTR">{<span className="font-mono">{proofs[0].utr}</span>}</Row>
              <Row label="Paid by">{proofs[0].payerName ?? "—"}</Row>
              <Row label="Amount due">{formatINR(proofs[0].amountPaise)}</Row>
              <Row label="Submitted">{formatDateTimeIST(proofs[0].submittedAt)}</Row>
            </dl>
          </div>
        ) : (
          <p className="text-sm text-muted">No payment proof submitted yet.</p>
        )}
        <div className="flex flex-wrap gap-6">
          {b.status === "in_review" && (
            <ActionForm action={approveBookingAction} submitLabel="Approve & issue passes" className="space-y-2">
              <input type="hidden" name="bookingId" value={b.id} />
              <label className="flex items-start gap-2 text-sm text-mist">
                <input type="checkbox" name="verified" required className="mt-0.5 h-5 w-5 accent-[#d7b777]" />I found this payment
                in the UPI account.
              </label>
            </ActionForm>
          )}
          {(b.status === "in_review" || b.status === "pending_payment") && (
            <ActionForm
              action={rejectBookingAction}
              submitLabel="Reject"
              submitClassName="btn-ghost !min-h-11"
              className="space-y-2"
              confirm="Reject this booking? Places are released."
            >
              <input type="hidden" name="bookingId" value={b.id} />
              <label className="sr-only" htmlFor="reject-reason">
                Reason shown to the buyer
              </label>
              <input
                id="reject-reason"
                name="reason"
                required
                minLength={5}
                placeholder="Reason shown to the buyer"
                className="field !min-h-10 text-sm"
              />
            </ActionForm>
          )}
          {b.status === "confirmed" && (
            <>
              <ActionForm
                action={resendConfirmation}
                submitLabel="Resend confirmation email"
                submitClassName="btn-ghost !min-h-11"
              >
                <input type="hidden" name="bookingId" value={b.id} />
              </ActionForm>
              <ActionForm
                action={cancelBookingAction}
                submitLabel="Cancel booking"
                submitClassName="btn-ghost !min-h-11"
                className="space-y-2"
                confirm="Cancel this booking? All its passes become void. Refund the buyer yourself via UPI first."
              >
                <input type="hidden" name="bookingId" value={b.id} />
                <label className="sr-only" htmlFor="cancel-reason">
                  Reason
                </label>
                <input
                  id="cancel-reason"
                  name="reason"
                  required
                  minLength={5}
                  placeholder="Reason (e.g. refunded via UPI)"
                  className="field !min-h-10 text-sm"
                />
              </ActionForm>
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="passes">
        <h2 id="passes" className="mb-3 font-display text-2xl text-ivory">
          Passes
        </h2>
        {ts.length === 0 ? (
          <p className="text-sm text-muted">No passes (issued only after confirmation).</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {ts.map((t) => (
              <li key={t.id} className="card p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ivory">Pass {t.ticketIndex}</span>
                  <span className={t.status === "valid" ? "text-success" : "text-danger"}>
                    {t.status}
                    {t.voidReason ? ` (${t.voidReason})` : ""}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {t.checkedInAt ? `Checked in ${formatDateTimeIST(t.checkedInAt)}` : "Not checked in"}
                </p>
                {t.status === "valid" && (
                  <ActionForm
                    action={voidTicketAction}
                    submitLabel="Void pass"
                    submitClassName="btn-ghost !min-h-9 text-xs"
                    className="mt-3 space-y-2"
                    confirm="Void this pass? It will be rejected at the door. This can’t be undone."
                  >
                    <input type="hidden" name="ticketId" value={t.id} />
                    <input type="hidden" name="bookingId" value={b.id} />
                    <label className="sr-only" htmlFor={`reason-${t.id}`}>
                      Reason
                    </label>
                    <input
                      id={`reason-${t.id}`}
                      name="reason"
                      required
                      minLength={5}
                      placeholder="Reason (e.g. partial refund)"
                      className="field !min-h-10 text-sm"
                    />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="timeline">
          <h2 id="timeline" className="mb-3 font-display text-2xl text-ivory">
            Timeline
          </h2>
          <ol className="space-y-2 text-sm">
            {events.map((ev) => (
              <li key={ev.id} className="rounded-xl border border-ivory/10 px-3 py-2">
                <span className="text-muted">{formatDateTimeIST(ev.createdAt)}</span> ·{" "}
                <span className="text-ivory">
                  {ev.fromStatus ?? "∅"} → {ev.toStatus}
                </span>{" "}
                · <span className="text-gold">{ev.source}</span>
                {ev.note && <div className="text-xs text-mist">{ev.note}</div>}
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="emails">
          <h2 id="emails" className="mb-3 font-display text-2xl text-ivory">
            Emails
          </h2>
          <ul className="space-y-2 text-sm">
            {emails.map((m) => (
              <li key={m.id} className="rounded-xl border border-ivory/10 px-3 py-2">
                <span className="text-ivory">{m.status}</span> · attempts {m.attempts} ·{" "}
                {m.sentAt ? `sent ${formatDateTimeIST(m.sentAt)}` : `next ${formatDateTimeIST(m.nextAttemptAt)}`}
                {m.lastError && <div className="text-xs text-danger">{m.lastError}</div>}
              </li>
            ))}
            {emails.length === 0 && <li className="text-muted">No emails.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
