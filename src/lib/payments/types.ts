export type GatewayPaymentStatus = "created" | "authorized" | "captured" | "failed" | "partially_refunded" | "refunded";

/** Normalised view of a gateway payment entity. Amounts in paise. */
export type GatewayPayment = {
  id: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  status: GatewayPaymentStatus;
  amountRefundedPaise: number;
  method: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  capturedAt: Date | null;
};

export type CreatedOrder = { id: string; amountPaise: number; currency: string };

export interface PaymentGateway {
  readonly provider: "razorpay" | "demo";
  /** Only the public key id is ever sent to the browser. */
  readonly publicKeyId: string | null;
  readonly isTestMode: boolean;
  createOrder(input: {
    amountPaise: number;
    currency: "INR";
    receipt: string;
    notes: Record<string, string>;
  }): Promise<CreatedOrder>;
  fetchPayment(paymentId: string): Promise<GatewayPayment>;
  fetchOrderPayments(orderId: string): Promise<GatewayPayment[]>;
  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): boolean;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}

export type PaymentMode =
  { kind: "razorpay"; keyMode: "test" | "live" } | { kind: "demo" } | { kind: "disabled"; reason: string; setupHint: string };

/** Monotonic ordering used to merge out-of-order updates for the same payment. */
export const PAYMENT_STATUS_RANK: Record<GatewayPaymentStatus, number> = {
  created: 0,
  failed: 1,
  authorized: 2,
  captured: 3,
  partially_refunded: 4,
  refunded: 5,
};

export function wasCaptured(status: GatewayPaymentStatus) {
  return status === "captured" || status === "partially_refunded" || status === "refunded";
}
