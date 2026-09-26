import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeCode } from "@/lib/codes";
import { normalizeIndianMobile } from "@/lib/phone";
import { bookingRequestSchema, safeNextPath, signupSchema } from "@/lib/validation";

describe("Indian phone normalisation", () => {
  it("normalises common formats to E.164", () => {
    for (const v of ["98765 43210", "+91 98765-43210", "09876543210", "919876543210", "+919876543210"]) {
      expect(normalizeIndianMobile(v)).toBe("+919876543210");
    }
  });
  it("rejects invalid numbers", () => {
    for (const v of ["12345", "5876543210", "+1 415 555 0100", "98765abc10", "", "9".repeat(25)]) {
      expect(normalizeIndianMobile(v)).toBeNull();
    }
  });
});

describe("signup validation", () => {
  const valid = {
    name: "Diya Kapoor",
    phone: "9876543210",
    email: "  Diya@Example.COM ",
    password: "correct horse battery",
    confirmPassword: "correct horse battery",
    referralCode: " camp-01 ",
    marketingOptIn: false,
  };
  it("normalises email, phone and referral code", () => {
    const r = signupSchema.parse(valid);
    expect(r.email).toBe("diya@example.com");
    expect(r.phone).toBe("+919876543210");
    expect(r.referralCode).toBe("CAMP-01");
  });
  it("rejects invalid fields", () => {
    const bad = signupSchema.safeParse({
      ...valid,
      name: "x",
      email: "nope",
      password: "short",
      confirmPassword: "different",
      phone: "123",
    });
    expect(bad.success).toBe(false);
    const fields = bad.error!.flatten().fieldErrors;
    expect(Object.keys(fields).sort()).toEqual(["email", "name", "password", "phone"].sort());
  });
  it("requires matching passwords", () => {
    const r = signupSchema.safeParse({ ...valid, confirmPassword: "something else" });
    expect(r.success).toBe(false);
    expect(r.error!.flatten().fieldErrors.confirmPassword).toBeDefined();
  });
  it("treats an empty referral code as none", () => {
    expect(signupSchema.parse({ ...valid, referralCode: "" }).referralCode).toBeNull();
  });
});

describe("booking request validation", () => {
  const base = {
    quantityTotal: 3,
    quantityGirls: 2,
    quantityBoys: 1,
    couponCode: "",
    referralCode: null,
    bookerName: "Aarav Sharma",
    bookerPhone: "98765 43210",
    bookerEmail: "a@example.com",
    eligibilityAck: true,
    termsAck: true,
    termsPolicyVersion: 1,
    idempotencyKey: randomUUID(),
  };
  it("accepts a valid request", () => {
    expect(bookingRequestSchema.safeParse(base).success).toBe(true);
  });
  it("requires girls + boys = total and integers ≥ 0", () => {
    expect(bookingRequestSchema.safeParse({ ...base, quantityBoys: 2 }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...base, quantityTotal: 0, quantityGirls: 0, quantityBoys: 0 }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...base, quantityGirls: -1, quantityBoys: 4 }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...base, quantityTotal: 2.5, quantityGirls: 1.5 }).success).toBe(false);
  });
  it("allows any gender mix, including all girls or all boys", () => {
    expect(bookingRequestSchema.safeParse({ ...base, quantityGirls: 3, quantityBoys: 0 }).success).toBe(true);
    expect(bookingRequestSchema.safeParse({ ...base, quantityGirls: 0, quantityBoys: 3 }).success).toBe(true);
  });
  it("requires both acknowledgements", () => {
    expect(bookingRequestSchema.safeParse({ ...base, eligibilityAck: false }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...base, termsAck: undefined }).success).toBe(false);
  });
  it("ignores client-supplied totals, discounts, roles and statuses", () => {
    const r = bookingRequestSchema.parse({ ...base, totalPaise: 1, discountPaise: 999_999, role: "admin", status: "confirmed" });
    expect(r).not.toHaveProperty("totalPaise");
    expect(r).not.toHaveProperty("role");
    expect(r).not.toHaveProperty("status");
  });
});

describe("codes", () => {
  it("normalises referral and coupon codes the same way but keeps them separate fields", () => {
    expect(normalizeCode("  fresh 10 ")).toBe("FRESH10");
    const r = bookingRequestSchema.parse({
      quantityTotal: 1,
      quantityGirls: 1,
      quantityBoys: 0,
      couponCode: "fresh10",
      referralCode: "camp-a",
      bookerName: "A B",
      bookerPhone: "9876543210",
      bookerEmail: "a@b.co",
      eligibilityAck: true,
      termsAck: true,
      termsPolicyVersion: 1,
      idempotencyKey: randomUUID(),
    });
    expect(r.couponCode).toBe("FRESH10");
    expect(r.referralCode).toBe("CAMP-A");
  });
});

describe("safeNextPath", () => {
  it("only allows internal app paths", () => {
    expect(safeNextPath("/book")).toBe("/book");
    expect(safeNextPath("/account/bookings/x")).toBe("/account/bookings/x");
    expect(safeNextPath("//evil.com")).toBe("/account");
    expect(safeNextPath("https://evil.com")).toBe("/account");
    expect(safeNextPath("/\\evil")).toBe("/account");
    expect(safeNextPath("/api/auth/sign-out")).toBe("/account");
  });
});
