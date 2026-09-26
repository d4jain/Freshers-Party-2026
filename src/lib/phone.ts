import { parsePhoneNumberFromString } from "libphonenumber-js/min";

/**
 * Validates an Indian mobile number and returns E.164 (+91XXXXXXXXXX).
 * Accepts "98765 43210", "+91 98765-43210", "09876543210", "919876543210".
 */
export function normalizeIndianMobile(input: string): string | null {
  const raw = input.trim();
  if (!raw || raw.length > 20) return null;
  if (!/^[+\d][\d\s\-()]*$/.test(raw)) return null;
  const parsed = parsePhoneNumberFromString(raw, "IN");
  if (!parsed || parsed.country !== "IN" || !parsed.isValid()) return null;
  const type = parsed.getType();
  // The "min" metadata cannot always tell mobile from fixed line; accept both
  // when unknown but reject clearly non-mobile types.
  if (type && type !== "MOBILE" && type !== "FIXED_LINE_OR_MOBILE") return null;
  if (!/^[6-9]\d{9}$/.test(parsed.nationalNumber)) return null;
  return parsed.number;
}

/** "+919876543210" → "+91 98765 43210" */
export function formatIndianMobile(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}
