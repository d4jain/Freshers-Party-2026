import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacSha256Hex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b) || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** Razorpay Checkout: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyRazorpayCheckoutSignature(secret: string, orderId: string, paymentId: string, signature: string): boolean {
  return safeEqualHex(hmacSha256Hex(secret, `${orderId}|${paymentId}`), signature);
}

/** Razorpay webhooks: HMAC_SHA256(raw request body, webhook secret). */
export function verifyRazorpayWebhookSignature(secret: string, rawBody: string, signature: string): boolean {
  return safeEqualHex(hmacSha256Hex(secret, rawBody), signature);
}
