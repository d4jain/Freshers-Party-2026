import { createCoupon, setCouponActive } from "@/app/admin/actions";
import { ActionForm } from "@/components/admin/action-form";
import { couponReport } from "@/lib/admin/queries";
import { getDb } from "@/lib/db";
import { formatDateTimeIST } from "@/lib/format";
import { formatINR } from "@/lib/money";

export default async function CouponsPage() {
  const rows = await couponReport(getDb());
  return (
    <div className="space-y-8">
      <h1 className="font-display text-4xl text-ivory">Coupons</h1>
      <p className="max-w-3xl text-sm text-muted">
        Coupons give discounts. One per order. Limits count held checkouts and confirmed uses, enforced transactionally. Referral
        codes are separate and never discount.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-ivory/10">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-ink-2 text-xs tracking-wider text-muted uppercase">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Discount</th>
              <th className="px-4 py-2">Window</th>
              <th className="px-4 py-2">Limits</th>
              <th className="px-4 py-2">Held / used</th>
              <th className="px-4 py-2">Paid conversions</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ivory/5">
            {rows.map((r) => (
              <tr key={r.coupon.id}>
                <td className="px-4 py-3">
                  <div className="font-semibold text-ivory">{r.coupon.code}</div>
                  <div className="text-xs text-muted">{r.coupon.description}</div>
                </td>
                <td className="px-4 py-3">
                  {r.coupon.discountType === "percent" ? `${r.coupon.percentOff}%` : formatINR(r.coupon.amountOffPaise ?? 0)}
                  {r.coupon.maxDiscountPaise ? ` (max ${formatINR(r.coupon.maxDiscountPaise)})` : ""}
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {r.coupon.startsAt ? `from ${formatDateTimeIST(r.coupon.startsAt)}` : "now"}
                  <br />
                  {r.coupon.expiresAt ? `until ${formatDateTimeIST(r.coupon.expiresAt)}` : "no expiry"}
                </td>
                <td className="px-4 py-3 text-xs">
                  total {r.coupon.maxRedemptions ?? "∞"} · per user {r.coupon.perUserLimit ?? "∞"}
                  {r.coupon.minQuantity ? ` · min ${r.coupon.minQuantity} ppl` : ""}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {r.held} / {r.committed}
                </td>
                <td className="px-4 py-3 text-xs">
                  {r.paidBookings} bookings · {r.paidPeople} people
                  <br />
                  {formatINR(r.paidTotalPaise)} paid · {formatINR(r.discountTotalPaise)} discounted
                </td>
                <td className="px-4 py-3">
                  <ActionForm
                    action={setCouponActive}
                    submitLabel={r.coupon.active ? "Deactivate" : "Activate"}
                    submitClassName="btn-ghost !min-h-9 text-xs"
                  >
                    <input type="hidden" name="id" value={r.coupon.id} />
                    <input type="hidden" name="active" value={r.coupon.active ? "false" : "true"} />
                  </ActionForm>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted">
                  No coupons yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="card p-6" aria-labelledby="new-coupon">
        <h2 id="new-coupon" className="mb-4 font-display text-2xl text-ivory">
          New coupon
        </h2>
        <ActionForm action={createCoupon} submitLabel="Create coupon" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="field-label" htmlFor="c-code">
                Code
              </label>
              <input id="c-code" name="code" required className="field uppercase" />
            </div>
            <div>
              <label className="field-label" htmlFor="c-type">
                Type
              </label>
              <select id="c-type" name="discountType" className="field">
                <option value="percent">Percent</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="c-desc">
                Description
              </label>
              <input id="c-desc" name="description" className="field" />
            </div>
            <div>
              <label className="field-label" htmlFor="c-pct">
                Percent off (1–90)
              </label>
              <input id="c-pct" name="percentOff" inputMode="numeric" className="field" />
            </div>
            <div>
              <label className="field-label" htmlFor="c-amt">
                Amount off (₹)
              </label>
              <input id="c-amt" name="amountOff" inputMode="decimal" className="field" />
            </div>
            <div>
              <label className="field-label" htmlFor="c-max">
                Max discount (₹, optional)
              </label>
              <input id="c-max" name="maxDiscount" inputMode="decimal" className="field" />
            </div>
            <div>
              <label className="field-label" htmlFor="c-minq">
                Min people (optional)
              </label>
              <input id="c-minq" name="minQuantity" inputMode="numeric" className="field" />
            </div>
            <div>
              <label className="field-label" htmlFor="c-mins">
                Min subtotal (₹, optional)
              </label>
              <input id="c-mins" name="minSubtotal" inputMode="decimal" className="field" />
            </div>
            <div>
              <label className="field-label" htmlFor="c-total">
                Total uses (optional)
              </label>
              <input id="c-total" name="maxRedemptions" inputMode="numeric" className="field" />
            </div>
            <div>
              <label className="field-label" htmlFor="c-user">
                Uses per user
              </label>
              <input id="c-user" name="perUserLimit" inputMode="numeric" defaultValue="1" className="field" />
            </div>
            <div>
              <label className="field-label" htmlFor="c-start">
                Starts (IST, optional)
              </label>
              <input id="c-start" name="startsAt" type="datetime-local" className="field" />
            </div>
            <div>
              <label className="field-label" htmlFor="c-exp">
                Expires (IST, optional)
              </label>
              <input id="c-exp" name="expiresAt" type="datetime-local" className="field" />
            </div>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
