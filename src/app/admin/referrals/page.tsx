import { createReferral, setReferralActive } from "@/app/admin/actions";
import { ActionForm } from "@/components/admin/action-form";
import { referralReport } from "@/lib/admin/queries";
import { getDb } from "@/lib/db";
import { formatINR } from "@/lib/money";

export default async function ReferralsPage() {
  const rows = await referralReport(getDb());
  return (
    <div className="space-y-8">
      <h1 className="font-display text-4xl text-ivory">Referral codes</h1>
      <p className="max-w-3xl text-sm text-muted">
        Referral codes attribute signups and bookings to an organiser or campaign. They never change the price. Attribution is
        stored on each booking and doesn’t change later. No payouts or wallets.
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
