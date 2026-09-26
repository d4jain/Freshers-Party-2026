import { describe, expect, it } from "vitest";
import { isAuthorizedCron } from "@/lib/cron";
import {
  formatManualCode,
  newManualCode,
  newPublicId,
  normalizeManualCode,
  parseQrPayload,
  qrPayloadFor,
} from "@/lib/tickets/token";

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
