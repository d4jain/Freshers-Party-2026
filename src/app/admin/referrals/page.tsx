import { createReferral, recordReferralPayoutAction, setReferralActive } from "@/app/admin/actions";
import { ActionForm } from "@/components/admin/action-form";
import { REFERRAL_TIERS } from "@/config/referrals";
import { referralReport } from "@/lib/admin/queries";
import { getDb } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { formatIndianMobile } from "@/lib/phone";
import { studentReferralBoard } from "@/lib/referrals";

export default async function ReferralsPage(props: PageProps<"/admin/referrals">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const db = getDb();
  const [rows, board] = await Promise.all([referralReport(db), studentReferralBoard(db)]);
  const students = q
    ? board.filter((r) => [r.code, r.ownerName, r.ownerEmail, r.ownerPhone].some((v) => v?.toLowerCase().includes(q)))
    : board;
  const totalDue = board.reduce((sum, r) => sum + r.duePaise, 0);
  const totalPaid = board.reduce((sum, r) => sum + r.paidPaise, 0);

  return (
    <div className="space-y-8">
      <h1 className="font-display text-4xl text-ivory">Referrals</h1>

      <section aria-labelledby="refer-now" className="space-y-4">
        <h2 id="refer-now" className="font-display text-3xl text-ivory">
          Refer Now — student cashback
        </h2>
        <p className="max-w-3xl text-sm text-muted">
          A referral counts when a friend’s confirmed booking made with the student’s code is checked in at the door (the
          student’s own bookings never count). Reward = highest level reached:{" "}
          {REFERRAL_TIERS.map((t) => `${t.min}+ → ${formatINR(t.rewardPaise)}`).join(" · ")}. Pay at the party in cash or UPI,
          then record it here — you can’t record more than is due.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <form className="flex w-full gap-2 sm:w-auto" role="search">
            <label htmlFor="ref-q" className="sr-only">
              Find a student
            </label>
            <input
              id="ref-q"
              name="q"
              defaultValue={q}
              placeholder="Code, name, email or phone"
              className="field !min-h-11 min-w-0 flex-1 sm:w-64 sm:flex-none"
            />
            <button className="btn-ghost !min-h-11 text-sm">Search</button>
          </form>
          <p className="text-sm text-mist">
            Due now: <span className="font-semibold text-gold">{formatINR(totalDue)}</span> · Paid so far:{" "}
            <span className="font-semibold text-ivory">{formatINR(totalPaid)}</span>
          </p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-ivory/10">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-ink-2 text-xs tracking-wider text-muted uppercase">
              <tr>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Student</th>
                <th className="px-4 py-2">Booked</th>
                <th className="px-4 py-2">Attended</th>
                <th className="px-4 py-2">Reward</th>
                <th className="px-4 py-2">Paid</th>
                <th className="px-4 py-2">Record payout</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ivory/5">
              {students.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-3 font-mono font-semibold text-ivory">{r.code}</td>
                  <td className="px-4 py-3">
                    <span className="text-ivory">{r.ownerName ?? "—"}</span>
                    <span className="block text-xs text-muted">
                      {r.ownerPhone ? formatIndianMobile(r.ownerPhone) : ""} {r.ownerEmail ?? ""}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{r.confirmedPeople}</td>
                  <td className="px-4 py-3 font-semibold text-gold tabular-nums">{r.attended}</td>
                  <td className="px-4 py-3 tabular-nums">{formatINR(r.rewardPaise)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatINR(r.paidPaise)}
                    {r.duePaise > 0 && <span className="block text-xs font-semibold text-gold">{formatINR(r.duePaise)} due</span>}
                  </td>
                  <td className="px-4 py-3">
                    {r.duePaise > 0 ? (
                      <ActionForm
                        action={recordReferralPayoutAction}
                        submitLabel="Record payout"
                        submitClassName="btn-gold !min-h-9 text-xs"
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="id" value={r.id} />
                        <label className="sr-only" htmlFor={`amt-${r.id}`}>
                          Amount in rupees
                        </label>
                        <input
                          id={`amt-${r.id}`}
                          name="amount"
                          type="number"
                          min={1}
                          max={r.duePaise / 100}
                          defaultValue={r.duePaise / 100}
                          className="field !min-h-9 w-24"
                        />
                        <label className="sr-only" htmlFor={`m-${r.id}`}>
                          Method
                        </label>
                        <select id={`m-${r.id}`} name="method" className="field !min-h-9 w-24" defaultValue="upi">
                          <option value="upi">UPI</option>
                          <option value="cash">Cash</option>
                        </select>
                      </ActionForm>
                    ) : (
                      <span className="text-xs text-muted">{r.rewardPaise > 0 ? "Paid in full" : "Nothing due yet"}</span>
                    )}
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted">
                    {q ? "No student matches that search." : "No student referrals with confirmed bookings yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <h2 className="pt-4 font-display text-3xl text-ivory">Organiser & campaign codes</h2>
      <p className="max-w-3xl text-sm text-muted">
        These codes attribute signups and bookings to an organiser or campaign. They never change the price and earn no cashback.
        Attribution is stored on each booking and doesn’t change later.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-ivory/10">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-ink-2 text-xs tracking-wider text-muted uppercase">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">For</th>
              <th className="px-4 py-2">Signups</th>
              <th className="px-4 py-2">Paid bookings</th>
              <th className="px-4 py-2">People</th>
              <th className="px-4 py-2">Paid total</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ivory/5">
            {rows.map((r) => (
              <tr key={r.referral.id}>
                <td className="px-4 py-3 font-semibold text-ivory">{r.referral.code}</td>
                <td className="px-4 py-3">
                  {r.referral.label} <span className="text-xs text-muted">({r.referral.ownerType})</span>
                </td>
                <td className="px-4 py-3 tabular-nums">{r.signups}</td>
                <td className="px-4 py-3 tabular-nums">{r.paidBookings}</td>
                <td className="px-4 py-3 tabular-nums">{r.paidPeople}</td>
                <td className="px-4 py-3 tabular-nums">{formatINR(r.paidTotalPaise)}</td>
                <td className="px-4 py-3">
                  <ActionForm
                    action={setReferralActive}
                    submitLabel={r.referral.active ? "Deactivate" : "Activate"}
                    submitClassName="btn-ghost !min-h-9 text-xs"
                  >
                    <input type="hidden" name="id" value={r.referral.id} />
                    <input type="hidden" name="active" value={r.referral.active ? "false" : "true"} />
                  </ActionForm>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted">
                  No referral codes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <section className="card p-6" aria-labelledby="new-ref">
        <h2 id="new-ref" className="mb-4 font-display text-2xl text-ivory">
          New referral code
        </h2>
        <ActionForm action={createReferral} submitLabel="Create code" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="field-label" htmlFor="r-code">
                Code
              </label>
              <input id="r-code" name="code" required className="field uppercase" />
            </div>
            <div>
              <label className="field-label" htmlFor="r-label">
                Label
              </label>
              <input id="r-label" name="label" required className="field" placeholder="e.g. Hostel B promoter" />
            </div>
            <div>
              <label className="field-label" htmlFor="r-type">
                Owner
              </label>
              <select id="r-type" name="ownerType" className="field">
                <option value="campaign">Campaign</option>
                <option value="organiser">Organiser</option>
              </select>
            </div>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
