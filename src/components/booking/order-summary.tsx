import { formatINR } from "@/lib/money";
import type { PriceBreakdown } from "@/lib/pricing";

/** Itemised order: count × price, subtotal, coupon, configured charges, total. */
export function OrderSummary({ breakdown, girls, boys }: { breakdown: PriceBreakdown; girls: number; boys: number }) {
  const b = breakdown;
  return (
    <dl className="space-y-3 text-[0.95rem]">
      <div className="flex justify-between gap-4">
        <dt className="text-mist">
          {b.quantity} × Freshers’ Pass <span className="text-muted">@ {formatINR(b.unitPricePaise)}</span>
          <span className="block text-xs text-muted">
            {girls} girl{girls === 1 ? "" : "s"} · {boys} boy{boys === 1 ? "" : "s"} — same price for everyone
          </span>
        </dt>
        <dd className="text-ivory tabular-nums">{formatINR(b.subtotalPaise)}</dd>
      </div>
      <div className="flex justify-between gap-4 border-t border-gold/10 pt-3">
        <dt className="text-mist">Subtotal</dt>
        <dd className="text-ivory tabular-nums">{formatINR(b.subtotalPaise)}</dd>
      </div>
      {b.coupon && (
        <div className="flex justify-between gap-4">
          <dt className="text-mist">
            Coupon <span className="font-semibold text-gold">{b.coupon.code}</span>
            <span className="block text-xs text-muted">
              {b.coupon.discountType === "percent" ? `${b.coupon.value}% off` : `${formatINR(b.coupon.value)} off`}
            </span>
          </dt>
          <dd className="text-success tabular-nums">−{formatINR(b.discountPaise)}</dd>
        </div>
      )}
      {b.fees.map((f) => (
        <div key={f.label} className="flex justify-between gap-4">
          <dt className="text-mist">{f.label}</dt>
          <dd className="text-ivory tabular-nums">{formatINR(f.amountPaise)}</dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-4 border-t border-gold/25 pt-4">
        <dt className="font-bold text-ivory">Total payable</dt>
        <dd className="display text-4xl text-gold tabular-nums">{formatINR(b.totalPaise)}</dd>
      </div>
      <p className="text-xs text-muted">This is the exact amount you’ll be asked to pay.</p>
    </dl>
  );
}
