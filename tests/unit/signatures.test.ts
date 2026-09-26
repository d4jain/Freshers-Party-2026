import { describe, expect, it } from "vitest";
import { isAuthorizedCron } from "@/lib/cron";
import { mapRazorpayPayment } from "@/lib/payments/razorpay";
import { hmacSha256Hex, verifyRazorpayCheckoutSignature, verifyRazorpayWebhookSignature } from "@/lib/payments/signature";
import {
  formatManualCode,
  newManualCode,
  newPublicId,
  normalizeManualCode,
  parseQrPayload,
  qrPayloadFor,
} from "@/lib/tickets/token";

describe("Razorpay signatures", () => {
  const secret = "key_secret_123";
  it("verifies checkout signatures over order_id|payment_id", () => {
    const sig = hmacSha256Hex(secret, "order_ABC123|pay_XYZ789");
    expect(verifyRazorpayCheckoutSignature(secret, "order_ABC123", "pay_XYZ789", sig)).toBe(true);
    expect(verifyRazorpayCheckoutSignature(secret, "order_OTHER1", "pay_XYZ789", sig)).toBe(false);
    expect(verifyRazorpayCheckoutSignature("wrong", "order_ABC123", "pay_XYZ789", sig)).toBe(false);
    expect(verifyRazorpayCheckoutSignature(secret, "order_ABC123", "pay_XYZ789", "zz")).toBe(false);
  });
  it("verifies webhook signatures against the exact raw body", () => {
    const body = '{"event":"payment.captured","payload":{}}';
    const sig = hmacSha256Hex("whsec", body);
    expect(verifyRazorpayWebhookSignature("whsec", body, sig)).toBe(true);
    expect(verifyRazorpayWebhookSignature("whsec", body.replace("captured", "failed"), sig)).toBe(false);
    expect(verifyRazorpayWebhookSignature("whsec", JSON.stringify(JSON.parse(body), null, 2), sig)).toBe(false);
  });
});

describe("payment mapping", () => {
  it("distinguishes authorised, captured and refunded states", () => {
    const base = { id: "pay_1", order_id: "order_1", amount: 219900, currency: "INR" };
    expect(mapRazorpayPayment({ ...base, status: "authorized" }).status).toBe("authorized");
    expect(mapRazorpayPayment({ ...base, status: "captured" }).status).toBe("captured");
    expect(mapRazorpayPayment({ ...base, status: "captured", amount_refunded: 1000 }).status).toBe("partially_refunded");
    expect(mapRazorpayPayment({ ...base, status: "refunded", amount_refunded: 219900 }).status).toBe("refunded");
    expect(mapRazorpayPayment({ ...base, status: "failed" }).status).toBe("failed");
  });
});

describe("ticket QR tokens", () => {
  const secret = "ticket-secret";
  it("round-trips signed opaque identifiers without personal data", () => {
    const id = newPublicId();
    const payload = qrPayloadFor(secret, id);
    expect(payload).toMatch(/^FP26\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/);
    expect(payload).not.toMatch(/@|\+91/);
    expect(parseQrPayload(secret, payload)).toEqual({ publicId: id });
  });
  it("rejects forged or tampered payloads", () => {
    const id = newPublicId();
    const payload = qrPayloadFor(secret, id);
    expect(parseQrPayload("other-secret", payload)).toBeNull();
    expect(parseQrPayload(secret, payload.slice(0, -2) + "AA")).toBeNull();
    expect(parseQrPayload(secret, `FP26.${newPublicId()}.${payload.split(".")[2]}`)).toBeNull();
    expect(parseQrPayload(secret, "not-a-ticket")).toBeNull();
  });
  it("generates unpredictable identifiers", () => {
    const ids = new Set(Array.from({ length: 2000 }, () => newPublicId()));
    expect(ids.size).toBe(2000);
  });
  it("normalises manual codes and ambiguous characters", () => {
    const code = newManualCode();
    expect(normalizeManualCode(formatManualCode(code).toLowerCase())).toBe(code);
    expect(normalizeManualCode("abcdo-1234l")).toBe("ABCD012341");
    expect(normalizeManualCode("short")).toBeNull();
  });
});

describe("cron authorisation", () => {
  it("requires the exact bearer secret", () => {
    const s = "a-long-cron-secret-value";
    expect(isAuthorizedCron(`Bearer ${s}`, s)).toBe(true);
    expect(isAuthorizedCron(`Bearer ${s}x`, s)).toBe(false);
    expect(isAuthorizedCron(null, s)).toBe(false);
    expect(isAuthorizedCron("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer short", "short")).toBe(false);
  });
});
