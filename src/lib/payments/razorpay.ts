import "server-only";
import Razorpay from "razorpay";
import type { CreatedOrder, GatewayPayment, GatewayPaymentStatus, PaymentGateway } from "./types";
import { verifyRazorpayCheckoutSignature, verifyRazorpayWebhookSignature } from "./signature";

/** Minimal shape of a Razorpay payment entity (API response or webhook payload). */
export type RazorpayPaymentEntity = {
  id: string;
  order_id?: string | null;
  amount: number | string;
  currency: string;
  status: string;
  captured?: boolean;
  amount_refunded?: number | string | null;
  method?: string | null;
  error_code?: string | null;
  error_description?: string | null;
  created_at?: number;
};

export function mapRazorpayPayment(entity: RazorpayPaymentEntity): GatewayPayment {
  const amount = Number(entity.amount);
  const refunded = Number(entity.amount_refunded ?? 0);
  let status: GatewayPaymentStatus;
  switch (entity.status) {
    case "captured":
      status = refunded > 0 ? "partially_refunded" : "captured";
      break;
    case "refunded":
      status = refunded >= amount ? "refunded" : "partially_refunded";
      break;
    case "authorized":
      status = "authorized";
      break;
    case "failed":
      status = "failed";
      break;
    default:
      status = "created";
  }
  return {
    id: entity.id,
    orderId: entity.order_id ?? "",
    amountPaise: amount,
    currency: entity.currency,
    status,
    amountRefundedPaise: refunded,
    method: entity.method ?? null,
    errorCode: entity.error_code ?? null,
    errorDescription: entity.error_description ?? null,
    capturedAt: status === "captured" || status === "partially_refunded" || status === "refunded" ? new Date() : null,
  };
}

export class RazorpayGateway implements PaymentGateway {
  readonly provider = "razorpay" as const;
  readonly publicKeyId: string;
  readonly isTestMode: boolean;
  private client: Razorpay;

  constructor(
    keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string | undefined,
  ) {
    this.publicKeyId = keyId;
    this.isTestMode = keyId.startsWith("rzp_test_");
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  async createOrder(input: {
    amountPaise: number;
    currency: "INR";
    receipt: string;
    notes: Record<string, string>;
  }): Promise<CreatedOrder> {
    const order = await this.client.orders.create({
      amount: input.amountPaise,
      currency: input.currency,
      receipt: input.receipt.slice(0, 40),
      notes: input.notes,
    });
    return { id: order.id, amountPaise: Number(order.amount), currency: order.currency };
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    const p = (await this.client.payments.fetch(paymentId)) as unknown as RazorpayPaymentEntity;
    return mapRazorpayPayment(p);
  }

  async fetchOrderPayments(orderId: string): Promise<GatewayPayment[]> {
    const res = (await this.client.orders.fetchPayments(orderId)) as unknown as { items: RazorpayPaymentEntity[] };
    return (res.items ?? []).map(mapRazorpayPayment);
  }

  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): boolean {
    return verifyRazorpayCheckoutSignature(this.keySecret, input.orderId, input.paymentId, input.signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!this.webhookSecret) return false;
    return verifyRazorpayWebhookSignature(this.webhookSecret, rawBody, signature);
  }
}
