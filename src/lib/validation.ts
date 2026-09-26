import { z } from "zod";
import { isValidCodeFormat, normalizeCode } from "./codes";
import { normalizeIndianMobile } from "./phone";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Enter your full name.")
  .max(80, "Keep the name under 80 characters.")
  .regex(/^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u, "Use letters, spaces, dots, apostrophes or hyphens.");

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.").max(254));

export const indianPhoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const normalized = normalizeIndianMobile(v);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Enter a valid Indian mobile number." });
      return z.NEVER;
    }
    return normalized;
  });

/** Optional code field: empty → null; otherwise normalised and format-checked. */
export const optionalCodeSchema = (label: string) =>
  z
    .string()
    .max(40)
    .nullish()
    .transform((v, ctx) => {
      const code = normalizeCode(v);
      if (code === null) return null;
      if (!isValidCodeFormat(code)) {
        ctx.addIssue({ code: "custom", message: `${label} can use letters, numbers and hyphens (3–24 characters).` });
        return z.NEVER;
      }
      return code;
    });

export const signupSchema = z
  .object({
    name: nameSchema,
    phone: indianPhoneSchema,
    email: emailSchema,
    password: z
      .string()
      .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
      .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`),
    confirmPassword: z.string(),
    referralCode: optionalCodeSchema("Referral code"),
    marketingOptIn: z.boolean().default(false),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don’t match.",
  });

export type SignupInput = z.input<typeof signupSchema>;

export const bookingRequestSchema = z
  .object({
    quantityTotal: z.number().int("Whole numbers only.").min(1, "At least one person.").max(100),
    quantityGirls: z.number().int("Whole numbers only.").min(0, "Can’t be negative."),
    quantityBoys: z.number().int("Whole numbers only.").min(0, "Can’t be negative."),
    couponCode: optionalCodeSchema("Coupon code"),
    referralCode: optionalCodeSchema("Referral code"),
    bookerName: nameSchema,
    bookerPhone: indianPhoneSchema,
    bookerEmail: emailSchema,
    eligibilityAck: z.literal(true, { error: "Please confirm everyone in this booking is a first-year Bennett student." }),
    termsAck: z.literal(true, { error: "Please accept the event terms and cancellation/refund policy." }),
    termsPolicyVersion: z.number().int().min(1),
    idempotencyKey: z.uuid(),
  })
  .refine((v) => v.quantityGirls + v.quantityBoys === v.quantityTotal, {
    path: ["quantityTotal"],
    message: "Girls + boys must add up to the total number of people.",
  });

export type BookingRequest = z.output<typeof bookingRequestSchema>;
export type BookingRequestInput = z.input<typeof bookingRequestSchema>;

export const pricePreviewSchema = z.object({
  quantityTotal: z.number().int().min(1).max(100),
  couponCode: optionalCodeSchema("Coupon code"),
});

export const razorpayCallbackSchema = z.object({
  razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/),
  razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]{6,40}$/),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Safe in-app redirect targets only (prevents open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = "/account"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  const allowed = ["/book", "/account", "/admin", "/staff"];
  return allowed.some((p) => next === p || next.startsWith(`${p}/`) || next.startsWith(`${p}?`)) ? next : fallback;
}
