"use client";

import { FlaskConical, LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { BottlePop } from "@/components/effects/bottle-pop";
import { useEffects } from "@/components/effects/effects-provider";
import type { CheckoutPayload } from "@/lib/booking/checkout";
import { formatINR } from "@/lib/money";
import { loadRazorpay, openRazorpay, type RazorpayHandlerResponse } from "./razorpay-loader";

export type CheckoutPhase = "idle" | "animating" | "open" | "verifying" | "dismissed" | "sdk_error";

/**
 * Drives the client side of payment after the server has created (or reused)
 * the order: bottle pop → Razorpay Checkout (or the clearly-labelled demo
 * dialog) → server-side verification → booking page. Nothing here decides
 * that a booking is confirmed; the booking page shows that only after the
 * server says so.
 */
export function useCheckoutRunner() {
  const router = useRouter();
  const { reducedMotion, effectsOn, setGlitterSuppressed } = useEffects();
  const [phase, setPhase] = useState<CheckoutPhase>("idle");
  const [payload, setPayload] = useState<CheckoutPayload | null>(null);
  const [paymentNote, setPaymentNote] = useState<string | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const payloadRef = useRef<CheckoutPayload | null>(null);

  useEffect(() => {
    // Preload the SDK so checkout opens right after the animation.
    loadRazorpay().catch(() => {});
    return () => setGlitterSuppressed(false);
  }, [setGlitterSuppressed]);

  const goToBooking = useCallback(
    (id: string) => {
      setGlitterSuppressed(false);
      router.push(`/account/bookings/${id}?from=checkout`);
    },
    [router, setGlitterSuppressed],
  );

  const verify = useCallback(
    async (p: CheckoutPayload, resp: RazorpayHandlerResponse) => {
      setPhase("verifying");
      try {
        await fetch(`/api/bookings/${p.bookingId}/verify`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(resp),
        });
      } catch {
        // Network trouble: the booking page keeps checking status (and the webhook/reconciler still run).
      }
      goToBooking(p.bookingId);
    },
    [goToBooking],
  );

  const openGateway = useCallback(async () => {
    const p = payloadRef.current;
    if (!p || !p.order) return;
    if (p.provider === "demo") {
      setPhase("open");
      setDemoOpen(true);
      return;
    }
    try {
      await loadRazorpay();
    } catch {
      setPhase("sdk_error");
      setGlitterSuppressed(false);
      return;
    }
    setPhase("open");
    openRazorpay(
      {
        key: p.keyId!,
        amount: p.order.amountPaise,
        currency: "INR",
        order_id: p.order.id,
        name: "Freshers’ Party 2026",
        description: `${p.breakdown.quantity} pass${p.breakdown.quantity === 1 ? "" : "es"} · ${p.reference}`,
        prefill: p.prefill,
        notes: { booking_reference: p.reference },
        theme: { color: "#D7B777", backdrop_color: "#09070D" },
        retry: { enabled: true },
        modal: {
          confirm_close: true,
          escape: true,
          ondismiss: () => {
            setPhase("dismissed");
            setGlitterSuppressed(false);
          },
        },
        handler: (resp) => void verify(p, resp),
      },
      (description) => setPaymentNote(`${description} You can try again — your places are still held.`),
    );
  }, [setGlitterSuppressed, verify]);

  /** Call only after the server returned a payable order. */
  const start = useCallback(
    (p: CheckoutPayload) => {
      payloadRef.current = p;
      setPayload(p);
      setPaymentNote(null);
      setGlitterSuppressed(true);
      if (reducedMotion || !effectsOn) {
        void openGateway();
      } else {
        setPhase("animating");
      }
    },
    [effectsOn, openGateway, reducedMotion, setGlitterSuppressed],
  );

  const retrySdk = useCallback(() => {
    setGlitterSuppressed(true);
    void openGateway();
  }, [openGateway, setGlitterSuppressed]);

  async function simulate(outcome: "captured" | "failed") {
    const p = payloadRef.current;
    if (!p) return;
    setDemoBusy(true);
    try {
      const res = await fetch(`/api/bookings/${p.bookingId}/demo-pay`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outcome }),
      });
      if (outcome === "captured" && res.ok) {
        setDemoOpen(false);
        goToBooking(p.bookingId);
        return;
      }
      setPaymentNote("Simulated payment failed. You can try again — your places are still held.");
    } finally {
      setDemoBusy(false);
    }
  }

  const overlays = (
    <>
      {phase === "animating" && <BottlePop onDone={() => void openGateway()} />}
      {phase === "verifying" && (
        <div
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-ink/85 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          data-no-glitter
        >
          <LoaderCircle className="h-10 w-10 animate-spin text-gold" aria-hidden="true" />
          <p className="font-display text-2xl text-ivory">Checking payment status…</p>
          <p className="text-sm text-muted">Please don’t close this tab or pay again.</p>
        </div>
      )}
      <Dialog.Root
        open={demoOpen}
        onOpenChange={(o) => {
          setDemoOpen(o);
          if (!o) {
            setPhase("dismissed");
            setGlitterSuppressed(false);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink/80 backdrop-blur-sm" />
          <Dialog.Content
            className="fixed top-1/2 left-1/2 z-[81] w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border-2 border-dashed border-danger/60 bg-ink-2 p-6 shadow-2xl"
            data-no-glitter
          >
            <div className="flex items-start justify-between gap-4">
              <Dialog.Title className="flex items-center gap-2 font-display text-2xl text-ivory">
                <FlaskConical className="h-6 w-6 text-danger" aria-hidden="true" />
                Demo checkout
              </Dialog.Title>
              <Dialog.Close
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gold/30"
                aria-label="Close demo checkout"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-[#ffd3cb]">
              DEMO MODE — no real payment is made and demo passes are not valid for entry.
            </Dialog.Description>
            {payload && (
              <p className="mt-4 text-mist">
                Booking {payload.reference} · <span className="text-ivory">{formatINR(payload.order?.amountPaise ?? 0)}</span>
              </p>
            )}
            <div className="mt-6 grid gap-3">
              <button type="button" className="btn-gold" disabled={demoBusy} onClick={() => void simulate("captured")}>
                Simulate successful payment
              </button>
              <button type="button" className="btn-ghost" disabled={demoBusy} onClick={() => void simulate("failed")}>
                Simulate failed payment
              </button>
            </div>
            {paymentNote && <p className="mt-4 text-sm text-danger">{paymentNote}</p>}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );

  return { phase, payload, paymentNote, start, retrySdk, overlays, setPhase };
}
