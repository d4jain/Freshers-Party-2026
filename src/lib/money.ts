/** Money is always integer paise. These helpers are safe on client and server. */

const whole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const withPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹2,199 for whole rupees; ₹3,958.20 when there are paise. */
export function formatINR(paise: number): string {
  if (!Number.isInteger(paise)) throw new Error("Amounts must be integer paise");
  return paise % 100 === 0 ? whole.format(paise / 100) : withPaise.format(paise / 100);
}

export function assertPaise(value: number, label = "amount"): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer number of paise`);
  }
  return value;
}
