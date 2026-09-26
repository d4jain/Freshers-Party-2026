import { describe, expect, it } from "vitest";
import { computeCouponDiscount, priceBooking, type CouponForPricing } from "@/lib/pricing";

const now = new Date("2026-09-26T12:00:00Z");
const base = { unitPricePaise: 219_900, compareAtPricePaise: 250_000, bookingFeePaise: 0, now };
const coupon = (c: Partial<CouponForPricing> = {}): CouponForPricing => ({
  id: "c1",
  code: "FRESH10",
  discountType: "percent",
  amountOffPaise: null,
  percentOff: 10,
  maxDiscountPaise: null,
  active: true,
  startsAt: null,
  expiresAt: null,
  minQuantity: null,
  minSubtotalPaise: null,
  ...c,
});

describe("priceBooking", () => {
  it("prices per person in integer paise with no surcharge by default", () => {
    const r = priceBooking({ ...base, quantity: 3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.breakdown.subtotalPaise).toBe(659_700);
    expect(r.breakdown.feesPaise).toBe(0);
    expect(r.breakdown.totalPaise).toBe(659_700);
    expect(r.breakdown.compareAtPricePaise).toBe(250_000);
  });

  it("rejects zero, negative and fractional quantities", () => {
    for (const q of [0, -1, 1.5, Number.NaN]) {
      const r = priceBooking({ ...base, quantity: q });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("INVALID_QUANTITY");
    }
  });

  it("applies percentage coupons with floor rounding and optional cap", () => {
    const r = priceBooking({ ...base, quantity: 3, coupon: coupon({ percentOff: 15 }) });
    expect(r.ok && r.breakdown.discountPaise).toBe(98_955);
    const capped = priceBooking({ ...base, quantity: 3, coupon: coupon({ percentOff: 50, maxDiscountPaise: 50_000 }) });
    expect(capped.ok && capped.breakdown.discountPaise).toBe(50_000);
    expect(capped.ok && capped.breakdown.totalPaise).toBe(609_700);
  });

  it("applies fixed coupons", () => {
    const r = priceBooking({
      ...base,
      quantity: 2,
      coupon: coupon({ discountType: "fixed", amountOffPaise: 20_000, percentOff: null }),
    });
    expect(r.ok && r.breakdown.totalPaise).toBe(419_800);
  });

  it("rejects expired, inactive, not-yet-started and minimum-violating coupons", () => {
    expect(priceBooking({ ...base, quantity: 2, coupon: coupon({ expiresAt: new Date("2026-09-01") }) })).toMatchObject({
      ok: false,
      code: "COUPON_EXPIRED",
    });
    expect(priceBooking({ ...base, quantity: 2, coupon: coupon({ active: false }) })).toMatchObject({
      ok: false,
      code: "COUPON_INACTIVE",
    });
    expect(priceBooking({ ...base, quantity: 2, coupon: coupon({ startsAt: new Date("2026-10-01") }) })).toMatchObject({
      ok: false,
      code: "COUPON_NOT_STARTED",
    });
    expect(priceBooking({ ...base, quantity: 2, coupon: coupon({ minQuantity: 4 }) })).toMatchObject({
      ok: false,
      code: "COUPON_MIN_QUANTITY",
    });
    expect(priceBooking({ ...base, quantity: 1, coupon: coupon({ minSubtotalPaise: 400_000 }) })).toMatchObject({
      ok: false,
      code: "COUPON_MIN_SUBTOTAL",
    });
  });

  it("treats the expiry instant as expired", () => {
    expect(priceBooking({ ...base, quantity: 1, coupon: coupon({ expiresAt: now }) })).toMatchObject({
      ok: false,
      code: "COUPON_EXPIRED",
    });
  });

  it("never produces a zero or negative payable total", () => {
    const r = priceBooking({
      ...base,
      quantity: 1,
      coupon: coupon({ discountType: "fixed", amountOffPaise: 219_900, percentOff: null }),
    });
    expect(r).toMatchObject({ ok: false, code: "TOTAL_TOO_LOW" });
    expect(computeCouponDiscount(coupon({ discountType: "fixed", amountOffPaise: 9_999_999, percentOff: null }), 100)).toBe(100);
  });

  it("adds only explicitly configured charges", () => {
    const r = priceBooking({ ...base, quantity: 2, bookingFeePaise: 1_000, bookingFeeLabel: "Venue handling" });
    expect(r.ok && r.breakdown.fees).toEqual([{ label: "Venue handling", amountPaise: 1_000 }]);
    expect(r.ok && r.breakdown.totalPaise).toBe(440_800);
  });
});
