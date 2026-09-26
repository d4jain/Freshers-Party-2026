import Link from "next/link";
import { approveBookingAction, rejectBookingAction } from "@/app/admin/actions";
import { StatusChip } from "@/components/account/status-chip";
import { ActionForm } from "@/components/admin/action-form";
import { reviewQueue } from "@/lib/admin/queries";
import { getDb } from "@/lib/db";
import { formatDateTimeIST } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { getSettings } from "@/lib/settings";

export default async function ReviewPage(props: PageProps<"/admin/review">) {
  const sp = await props.searchParams;
  const showRecent = sp.view === "recent";
  const db = getDb();
  const [rows, settings] = await Promise.all([reviewQueue(db, showRecent ? "all_recent" : "in_review"), getSettings(db)]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-ivory">Payment review</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            For each booking, find the payment in the UPI app for{" "}
            <strong className="text-mist">{settings.upiId ?? "your UPI ID"}</strong> and check the amount and transaction ID (UTR)
            match. Approving confirms the booking and issues passes. Rejecting releases the places and shows your reason to the
            buyer.
          </p>
        </div>
        <Link className="text-sm font-semibold text-gold" href={showRecent ? "/admin/review" : "/admin/review?view=recent"}>
          {showRecent ? "Show only waiting" : "Show last 14 days"}
        </Link>
      </div>

      {typeof sp.done === "string" && sp.done && (
        <p
          role="status"
          className={`rounded-2xl border p-4 text-sm ${sp.result === "approved" ? "border-success/40 bg-success/10 text-success" : "border-danger/40 bg-danger/10 text-[#ffd3cb]"}`}
        >
          {sp.result === "approved"
            ? `${sp.done} approved — passes issued.`
            : `${sp.done} rejected — places released and the buyer can see your reason.`}
        </p>
      )}

      {rows.length === 0 && <p className="card p-6 text-mist">Nothing waiting for review.</p>}

      <ul className="space-y-5">
        {rows.map((r) => {
          const amountMismatch = r.proof_amount_paise !== r.total_paise;
          return (
            <li key={r.id} className="card grid gap-5 p-5 lg:grid-cols-[minmax(0,20rem)_1fr]">
              <a
                href={`/api/bookings/${r.id}/proof`}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-xl border border-gold/20 bg-ink"
                aria-label={`Open payment screenshot for ${r.reference} in a new tab`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- private, authenticated image */}
                <img
                  src={`/api/bookings/${r.id}/proof`}
                  alt={`Payment screenshot for ${r.reference}`}
                  className="max-h-[28rem] w-full object-contain"
                  loading="lazy"
                />
              </a>
              <div className="min-w-0 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`/admin/bookings/${r.id}`}
                    className="font-display text-2xl text-ivory underline-offset-4 hover:underline"
                  >
                    {r.reference}
                  </Link>
                  <StatusChip status={r.status} />
                  {r.is_demo && <span className="text-xs font-bold text-danger">DEMO</span>}
                </div>
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted">Amount due</dt>
                    <dd className="text-2xl font-semibold text-gold">{formatINR(r.total_paise)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">UPI transaction ID (UTR)</dt>
                    <dd className="font-mono text-lg break-all text-ivory">{r.utr}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Booker</dt>
                    <dd className="text-ivory">
                      {r.booker_name} · {r.booker_phone}
                      <span className="block text-xs text-muted">{r.booker_email}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Paid by (as entered)</dt>
                    <dd className="text-ivory">{r.payer_name ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">People</dt>
                    <dd className="text-ivory">
                      {r.quantity_total} ({r.quantity_girls} girls, {r.quantity_boys} boys)
                      {r.coupon_code ? ` · coupon ${r.coupon_code}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Submitted</dt>
                    <dd className="text-ivory">{formatDateTimeIST(r.submitted_at)}</dd>
                  </div>
                </dl>
                {(r.same_utr > 0 || r.same_image > 0 || amountMismatch) && (
                  <ul
                    className="space-y-1 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-[#ffd3cb]"
                    role="note"
                  >
                    {r.same_utr > 0 && <li>⚠ This transaction ID was also submitted on {r.same_utr} other booking(s).</li>}
                    {r.same_image > 0 && <li>⚠ The exact same screenshot was uploaded on {r.same_image} other booking(s).</li>}
                    {amountMismatch && <li>⚠ The booking total changed after the proof was submitted.</li>}
                  </ul>
                )}
                {r.status === "in_review" && (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <ActionForm
                      action={approveBookingAction}
                      submitLabel="Approve & issue passes"
                      className="space-y-3 rounded-xl border border-success/30 p-4"
                    >
                      <input type="hidden" name="bookingId" value={r.id} />
                      <input type="hidden" name="returnTo" value="/admin/review" />
                      <label className="flex items-start gap-2 text-sm text-mist">
                        <input type="checkbox" name="verified" className="mt-0.5 h-5 w-5 accent-[#d7b777]" required />I found{" "}
                        {formatINR(r.total_paise)} with this transaction ID in the UPI account.
                      </label>
                      <label className="sr-only" htmlFor={`note-${r.id}`}>
                        Internal note (optional)
                      </label>
                      <input
                        id={`note-${r.id}`}
                        name="note"
                        placeholder="Internal note (optional)"
                        className="field !min-h-10 text-sm"
                      />
                    </ActionForm>
                    <ActionForm
                      action={rejectBookingAction}
                      submitLabel="Reject"
                      submitClassName="btn-ghost !min-h-11"
                      className="space-y-3 rounded-xl border border-danger/30 p-4"
                      confirm="Reject this booking? Its places are released and the buyer sees your reason."
                    >
                      <input type="hidden" name="bookingId" value={r.id} />
                      <input type="hidden" name="returnTo" value="/admin/review" />
                      <input type="hidden" name="reference" value={r.reference} />
                      <label className="field-label" htmlFor={`reason-${r.id}`}>
                        Reason shown to the buyer
                      </label>
                      <input
                        id={`reason-${r.id}`}
                        name="reason"
                        required
                        minLength={5}
                        placeholder="e.g. No payment found with this transaction ID"
                        className="field !min-h-10 text-sm"
                      />
                    </ActionForm>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
