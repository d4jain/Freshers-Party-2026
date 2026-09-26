import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * QR payload: "FP26.<publicId>.<sig>"
 *  - publicId: 16 random bytes (base64url), stored in `tickets.public_id`
 *  - sig: HMAC-SHA256(TICKET_SIGNING_SECRET, "ticket:v1:" + publicId), first 16 bytes, base64url
 * No name, phone, email or booking data is embedded. Forging a pass needs
 * both an issued publicId and the server secret.
 */
const PREFIX = "FP26";

export function newPublicId(): string {
  return randomBytes(16).toString("base64url");
}

function sign(secret: string, publicId: string): string {
  return createHmac("sha256", secret).update(`ticket:v1:${publicId}`).digest().subarray(0, 16).toString("base64url");
}

export function qrPayloadFor(secret: string, publicId: string): string {
  return `${PREFIX}.${publicId}.${sign(secret, publicId)}`;
}

export function parseQrPayload(secret: string, payload: string): { publicId: string } | null {
  const parts = payload.trim().split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const [, publicId, sig] = parts as [string, string, string];
  if (!/^[A-Za-z0-9_-]{22}$/.test(publicId) || !/^[A-Za-z0-9_-]{22}$/.test(sig)) return null;
  const expected = Buffer.from(sign(secret, publicId), "base64url");
  const given = Buffer.from(sig, "base64url");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { publicId };
}

/** Crockford base32 (no I, L, O, U). 10 chars = 50 bits. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newManualCode(): string {
  const bytes = randomBytes(10);
  let out = "";
  for (const b of bytes) out += CROCKFORD[b % 32];
  return out;
}

export function formatManualCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** Accepts "abcde-12345", maps ambiguous characters (O→0, I/L→1). */
export function normalizeManualCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (!/^[0-9A-HJKMNP-TV-Z]{10}$/.test(cleaned)) return null;
  return cleaned;
}
