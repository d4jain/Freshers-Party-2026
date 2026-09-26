/**
 * Referral codes (attribution) and coupon codes (discounts) share one
 * normalisation rule but are stored, validated and applied separately.
 * A referral code never grants a discount.
 */
export const CODE_PATTERN = /^[A-Z0-9-]{3,24}$/;

export function normalizeCode(input: string | null | undefined): string | null {
  if (input == null) return null;
  const cleaned = input.normalize("NFKC").trim().toUpperCase().replace(/\s+/g, "");
  if (cleaned === "") return null;
  return cleaned;
}

export function isValidCodeFormat(code: string): boolean {
  return CODE_PATTERN.test(code);
}

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

/** Unpredictable, human-friendly reference: FP26-XXXXXXXX (40 bits). */
export function generateBookingReference(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(8);
  let out = "";
  for (const b of bytes) out += REFERENCE_ALPHABET[b % 32];
  return `FP26-${out}`;
}
