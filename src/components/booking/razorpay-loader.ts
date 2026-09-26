"use client";

export type RazorpayHandlerResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: "INR";
  order_id: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string; backdrop_color?: string };
  modal?: { ondismiss?: () => void; confirm_close?: boolean; escape?: boolean; backdropclose?: boolean };
  retry?: { enabled: boolean };
  handler: (response: RazorpayHandlerResponse) => void;
};

type RazorpayInstance = {
  open: () => void;
  close: () => void;
  on: (event: "payment.failed", cb: (resp: { error: { code?: string; description?: string; reason?: string } }) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const SRC = "https://checkout.razorpay.com/v1/checkout.js";
let pending: Promise<void> | null = null;

/**
 * Loads Razorpay Checkout once. On failure the promise resets so the user can
 * retry (flaky mobile networks, blocked script, etc.).
 */
export function loadRazorpay(timeoutMs = 12_000): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.Razorpay) return Promise.resolve();
  if (pending) return pending;
  pending = new Promise<void>((resolve, reject) => {
    document.querySelectorAll(`script[src="${SRC}"]`).forEach((s) => s.remove());
    const script = document.createElement("script");
    script.src = SRC;
    script.async = true;
    const timer = window.setTimeout(() => fail(new Error("timeout")), timeoutMs);
    function fail(err: Error) {
      window.clearTimeout(timer);
      script.remove();
      pending = null;
      reject(err);
    }
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.Razorpay) resolve();
      else fail(new Error("Razorpay unavailable after load"));
    };
    script.onerror = () => fail(new Error("script error"));
    document.head.appendChild(script);
  });
  return pending;
}

export function openRazorpay(options: RazorpayOptions, onFailed: (description: string) => void): RazorpayInstance {
  if (!window.Razorpay) throw new Error("Razorpay not loaded");
  const rzp = new window.Razorpay(options);
  rzp.on("payment.failed", (resp) => onFailed(resp.error?.description ?? "The payment didn’t go through."));
  rzp.open();
  return rzp;
}
