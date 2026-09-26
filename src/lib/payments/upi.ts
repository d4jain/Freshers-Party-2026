import { EVENT_FACTS } from "@/config/event";
import type { EventSettingsRow } from "@/lib/db/schema";

/**
 * Manual UPI payments: buyers pay the organiser's QR / UPI ID, then upload a
 * screenshot and the UPI transaction id. No payment gateway is involved; an
 * organiser verifies every payment before a booking is confirmed.
 */
export const DEFAULT_PAYMENT_QR_PATH = "/media/payment/upi-qr.png";

export type UpiDetails = {
  upiId: string | null;
  payeeName: string | null;
  qrPath: string;
};

export function upiDetails(settings: Pick<EventSettingsRow, "upiId" | "upiPayeeName" | "paymentQrPath">): UpiDetails {
  return {
    upiId: settings.upiId,
    payeeName: settings.upiPayeeName,
    qrPath: settings.paymentQrPath || DEFAULT_PAYMENT_QR_PATH,
  };
}

/**
 * `upi://pay` link with the amount and booking reference prefilled, so phone
 * users (who can't scan their own screen) can open their UPI app directly.
 */
export function upiPayLink(opts: { upiId: string; payeeName: string | null; amountPaise: number; reference: string }): string {
  const params = new URLSearchParams({
    pa: opts.upiId,
    ...(opts.payeeName ? { pn: opts.payeeName } : {}),
    am: (opts.amountPaise / 100).toFixed(2),
    cu: "INR",
    tn: `${EVENT_FACTS.shortName} ${opts.reference}`.slice(0, 50),
  });
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}

/** UPI transaction / UTR ids: letters and digits only, 6–35 chars (UTRs are usually 12 digits). */
export function normalizeUtr(input: string): string | null {
  const cleaned = input.trim().toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z0-9]{6,35}$/.test(cleaned) ? cleaned : null;
}
