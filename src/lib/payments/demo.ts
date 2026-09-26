import "server-only";
import { randomBytes } from "node:crypto";
import type { CreatedOrder, GatewayPayment, PaymentGateway } from "./types";

/**
 * DEMO gateway — no money moves and no real provider is contacted.
 * Only reachable when DEMO_MODE=true outside production and no Razorpay keys
 * are configured. Bookings and passes created this way are flagged `is_demo`
 * and are rejected at the door.
 */
export class DemoGateway implements PaymentGateway {
  readonly provider = "demo" as const;
  readonly publicKeyId = null;
  readonly isTestMode = true;

  async createOrder(input: { amountPaise: number; currency: "INR" }): Promise<CreatedOrder> {
    return { id: `demo_order_${randomBytes(9).toString("hex")}`, amountPaise: input.amountPaise, currency: input.currency };
  }

  /** Demo payments are simulated server-side via `simulateDemoPayment`, never fetched. */
  async fetchPayment(): Promise<GatewayPayment> {
    throw new Error("Demo gateway has no remote payments");
  }

  async fetchOrderPayments(): Promise<GatewayPayment[]> {
    return [];
  }

  verifyCheckoutSignature(): boolean {
    return false;
  }

  verifyWebhookSignature(): boolean {
    return false;
  }
}

export function makeDemoPayment(orderId: string, amountPaise: number, outcome: "captured" | "failed"): GatewayPayment {
  return {
    id: `demo_pay_${randomBytes(9).toString("hex")}`,
    orderId,
    amountPaise,
    currency: "INR",
    status: outcome,
    amountRefundedPaise: 0,
    method: "demo",
    errorCode: outcome === "failed" ? "DEMO_DECLINED" : null,
    errorDescription: outcome === "failed" ? "Simulated failure (demo mode)" : null,
    capturedAt: outcome === "captured" ? new Date() : null,
  };
}
