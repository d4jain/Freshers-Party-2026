import "server-only";
import { env } from "@/lib/env";
import { DemoGateway } from "./demo";
import { RazorpayGateway } from "./razorpay";
import type { PaymentGateway, PaymentMode } from "./types";

export * from "./types";

/**
 * Decides how checkout runs. Demo mode can never activate in production, and
 * live Razorpay keys are refused unless ALLOW_LIVE_PAYMENTS=true is set on
 * purpose.
 */
export function resolvePaymentMode(): PaymentMode {
  const e = env();
  const keyId = e.RAZORPAY_KEY_ID;
  const secret = e.RAZORPAY_KEY_SECRET;

  if (keyId && secret) {
    const live = keyId.startsWith("rzp_live_");
    if (!live && !keyId.startsWith("rzp_test_")) {
      return {
        kind: "disabled",
        reason: "The Razorpay key id is not recognised.",
        setupHint: "RAZORPAY_KEY_ID should start with rzp_test_ or rzp_live_.",
      };
    }
    if (live && !e.ALLOW_LIVE_PAYMENTS) {
      return {
        kind: "disabled",
        reason: "Live Razorpay keys are present but live payments are not enabled.",
        setupHint: "Set ALLOW_LIVE_PAYMENTS=true only after the organiser approves going live.",
      };
    }
    if (live && !e.RAZORPAY_WEBHOOK_SECRET) {
      return {
        kind: "disabled",
        reason: "Live payments need a webhook secret.",
        setupHint: "Create the webhook in the Razorpay Dashboard and set RAZORPAY_WEBHOOK_SECRET.",
      };
    }
    return { kind: "razorpay", keyMode: live ? "live" : "test" };
  }

  if (e.DEMO_MODE && !e.isProduction) return { kind: "demo" };

  return {
    kind: "disabled",
    reason: "Online checkout isn’t configured yet.",
    setupHint:
      "Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (test keys first). For local previews without keys, set DEMO_MODE=true.",
  };
}

let override: PaymentGateway | undefined;

/** Test hook. */
export function setGatewayOverride(g: PaymentGateway | undefined) {
  override = g;
}

export function getGateway(): PaymentGateway | null {
  if (override) return override;
  const mode = resolvePaymentMode();
  const e = env();
  if (mode.kind === "razorpay") {
    return new RazorpayGateway(e.RAZORPAY_KEY_ID!, e.RAZORPAY_KEY_SECRET!, e.RAZORPAY_WEBHOOK_SECRET);
  }
  if (mode.kind === "demo") return new DemoGateway();
  return null;
}
