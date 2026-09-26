import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resendConfirmation, retryConfirmation, syncWithGateway, voidTicketAction, resolveException } from "@/app/admin/actions";
import { StatusChip } from "@/components/account/status-chip";
import { ActionForm } from "@/components/admin/action-form";
import { OrderSummary } from "@/components/booking/order-summary";
import { getDb } from "@/lib/db";
import { bookingEvents, bookingExceptions, bookings, emailOutbox, paymentAttempts, tickets } from "@/lib/db/schema";
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
  const [attempts, ts, events, exceptions, emails] = await Promise.all([
    db.select().from(paymentAttempts).where(eq(paymentAttempts.bookingId, id)).orderBy(asc(paymentAttempts.createdAt)),
    db.select().from(tickets).where(eq(tickets.bookingId, id)).orderBy(asc(tickets.ticketIndex)),
    db.select().from(bookingEvents).where(eq(bookingEvents.bookingId, id)).orderBy(desc(bookingEvents.createdAt)),
    db.select().from(bookingExceptions).where(eq(bookingExceptions.bookingId, id)).orderBy(desc(bookingExceptions.createdAt)),
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
            <Row label="Gateway order">{b.gatewayOrderId ?? "—"}</Row>
            <Row label="Primary payment">{b.capturedPaymentId ?? "—"}</Row>
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

      <section className="card space-y-4 p-5" aria-labelledby="actions">
        <h2 id="actions" className="font-display text-2xl text-ivory">
          Actions
        </h2>
        <p className="text-sm text-muted">
          Refunds are made in the Razorpay Dashboard; the webhook then syncs them here and voids passes. There is no “mark as
          paid” — only a captured Razorpay payment can confirm a booking.
        </p>
        <div className="flex flex-wrap gap-6">
          {b.paymentProvider === "razorpay" && b.gatewayOrderId && (
            <ActionForm action={syncWithGateway} submitLabel="Sync with Razorpay" submitClassName="btn-ghost !min-h-11">
              <input type="hidden" name="bookingId" value={b.id} />
            </ActionForm>
          )}
          {b.status === "confirmed" && (
            <ActionForm action={resendConfirmation} submitLabel="Resend confirmation email" submitClassName="btn-ghost !min-h-11">
              <input type="hidden" name="bookingId" value={b.id} />
            </ActionForm>
          )}
          {b.status === "needs_review" && b.capturedPaymentId && (
            <ActionForm
              action={retryConfirmation}
              submitLabel="Retry confirmation (capacity rechecked)"
              confirm="Re-run confirmation using the captured payment? Passes are issued only if places are available."
            >
              <input type="hidden" name="bookingId" value={b.id} />
            </ActionForm>
          )}
        </div>
      </section>

      <section aria-labelledby="payments">
        <h2 id="payments" className="mb-3 font-display text-2xl text-ivory">
          Payment attempts
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-ivory/10">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-ink-2 text-xs tracking-wider text-muted uppercase">
              <tr>
                <th className="px-4 py-2">Payment id</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2 text-right">Refunded</th>
                <th className="px-4 py-2">Method</th>
                <th className="px-4 py-2">Last source</th>
                <th className="px-4 py-2">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ivory/5">
              {attempts.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2 font-mono text-xs">
                    {a.gatewayPaymentId}
                    {a.isExtraCapture && <span className="ml-2 font-sans font-bold text-danger">EXTRA</span>}
                  </td>
                  <td className="px-4 py-2">
                    {a.status}
                    {a.errorDescription ? ` — ${a.errorDescription}` : ""}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatINR(a.amountPaise)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatINR(a.amountRefundedPaise)}</td>
                  <td className="px-4 py-2">{a.method ?? "—"}</td>
                  <td className="px-4 py-2">{a.lastSource}</td>
                  <td className="px-4 py-2 text-xs text-muted">{formatDateTimeIST(a.updatedAt)}</td>
                </tr>
              ))}
              {attempts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted">
                    No payment attempts recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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

      {exceptions.length > 0 && (
        <section aria-labelledby="exc">
          <h2 id="exc" className="mb-3 font-display text-2xl text-ivory">
            Exceptions
          </h2>
          <ul className="space-y-3">
            {exceptions.map((e) => (
              <li key={e.id} className="card p-4 text-sm">
                <p className="font-semibold text-ivory">{e.kind.replaceAll("_", " ")}</p>
                <p className="text-xs text-muted">
                  {formatDateTimeIST(e.createdAt)} · {JSON.stringify(e.details)}
                </p>
                {e.resolvedAt ? (
                  <p className="mt-2 text-success">
                    Resolved {formatDateTimeIST(e.resolvedAt)} — {e.resolutionNote}
                  </p>
                ) : (
                  <ActionForm
                    action={resolveException}
                    submitLabel="Mark resolved"
                    className="mt-3 space-y-2"
                    submitClassName="btn-ghost !min-h-10 text-xs"
                  >
                    <input type="hidden" name="id" value={e.id} />
                    <label className="sr-only" htmlFor={`note-${e.id}`}>
                      Resolution note
                    </label>
                    <input
                      id={`note-${e.id}`}
                      name="note"
                      required
                      minLength={5}
                      placeholder="What did you do? (e.g. refunded pay_… in Razorpay)"
                      className="field !min-h-10 text-sm"
                    />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

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
