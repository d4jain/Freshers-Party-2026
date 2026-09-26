/**
 * Pure pricing. Used for the client preview AND recomputed on the server
 * inside the booking transaction. The server never trusts submitted totals.
 * All values are integer paise.
 */

export const MIN_PAYABLE_PAISE = 100; // Razorpay's minimum order amount is ₹1.

export type CouponForPricing = {
  id: string;
  code: string;
  discountType: "fixed" | "percent";
  amountOffPaise: number | null;
  percentOff: number | null;
  maxDiscountPaise: number | null;
  active: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
  minQuantity: number | null;
  minSubtotalPaise: number | null;
};

export type PricingInput = {
  quantity: number;
  unitPricePaise: number;
  compareAtPricePaise: number | null;
  bookingFeePaise: number;
  bookingFeeLabel?: string | null;
  coupon?: CouponForPricing | null;
  now: Date;
};

export type PriceBreakdown = {
  currency: "INR";
  quantity: number;
  unitPricePaise: number;
  compareAtPricePaise: number | null;
  subtotalPaise: number;
  discountPaise: number;
  coupon: { id: string; code: string; discountType: "fixed" | "percent"; value: number } | null;
  fees: { label: string; amountPaise: number }[];
  feesPaise: number;
  totalPaise: number;
};

export type PricingErrorCode =
  | "INVALID_QUANTITY"
  | "INVALID_PRICE"
  | "COUPON_INACTIVE"
  | "COUPON_NOT_STARTED"
  | "COUPON_EXPIRED"
  | "COUPON_MIN_QUANTITY"
  | "COUPON_MIN_SUBTOTAL"
  | "TOTAL_TOO_LOW";

export type PricingResult = { ok: true; breakdown: PriceBreakdown } | { ok: false; code: PricingErrorCode; message: string };

const fail = (code: PricingErrorCode, message: string): PricingResult => ({ ok: false, code, message });

function isPaise(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
}

export function computeCouponDiscount(coupon: CouponForPricing, subtotalPaise: number): number {
  let discount = 0;
  if (coupon.discountType === "fixed") {
    discount = coupon.amountOffPaise ?? 0;
  } else {
    const pct = coupon.percentOff ?? 0;
    discount = Math.floor((subtotalPaise * pct) / 100);
  }
  if (coupon.maxDiscountPaise != null) discount = Math.min(discount, coupon.maxDiscountPaise);
  return Math.max(0, Math.min(discount, subtotalPaise));
}

export function priceBooking(input: PricingInput): PricingResult {
  const { quantity, unitPricePaise, compareAtPricePaise, bookingFeePaise, coupon, now } = input;
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    return fail("INVALID_QUANTITY", "Choose at least one person.");
  }
  if (!isPaise(unitPricePaise) || unitPricePaise <= 0 || !isPaise(bookingFeePaise)) {
    return fail("INVALID_PRICE", "Ticket pricing is not configured correctly.");
  }

  const subtotalPaise = unitPricePaise * quantity;
  let discountPaise = 0;
  let appliedCoupon: PriceBreakdown["coupon"] = null;

  if (coupon) {
    if (!coupon.active) return fail("COUPON_INACTIVE", "This coupon isn’t active.");
    if (coupon.startsAt && now < coupon.startsAt) return fail("COUPON_NOT_STARTED", "This coupon isn’t valid yet.");
    if (coupon.expiresAt && now >= coupon.expiresAt) return fail("COUPON_EXPIRED", "This coupon has expired.");
    if (coupon.minQuantity != null && quantity < coupon.minQuantity) {
      return fail("COUPON_MIN_QUANTITY", `This coupon needs at least ${coupon.minQuantity} people in the booking.`);
    }
    if (coupon.minSubtotalPaise != null && subtotalPaise < coupon.minSubtotalPaise) {
      return fail("COUPON_MIN_SUBTOTAL", "This booking is below the coupon’s minimum amount.");
    }
    discountPaise = computeCouponDiscount(coupon, subtotalPaise);
    appliedCoupon = {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      value: coupon.discountType === "fixed" ? (coupon.amountOffPaise ?? 0) : (coupon.percentOff ?? 0),
    };
  }

  const fees = bookingFeePaise > 0 ? [{ label: input.bookingFeeLabel || "Booking fee", amountPaise: bookingFeePaise }] : [];
  const feesPaise = fees.reduce((s, f) => s + f.amountPaise, 0);
  const totalPaise = subtotalPaise - discountPaise + feesPaise;

  if (totalPaise < MIN_PAYABLE_PAISE) {
    return fail("TOTAL_TOO_LOW", "This coupon would make the booking free, which isn’t supported online.");
  }

  return {
    ok: true,
    breakdown: {
      currency: "INR",
      quantity,
      unitPricePaise,
      compareAtPricePaise: compareAtPricePaise ?? null,
      subtotalPaise,
      discountPaise,
      coupon: appliedCoupon,
      fees,
      feesPaise,
      totalPaise,
    },
  };
}
