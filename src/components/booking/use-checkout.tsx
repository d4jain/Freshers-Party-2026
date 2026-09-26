"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { BottlePop } from "@/components/effects/bottle-pop";
import { useEffects } from "@/components/effects/effects-provider";
import type { CheckoutPayload } from "@/lib/booking/checkout";

/**
 * After the server has created (or reused) the booking and held the places:
 * play the bottle pop (skipped for reduced motion / effects off), then open
 * the booking's payment page (UPI QR + proof upload). Nothing here marks the
 * booking as paid or confirmed.
 */
export function useCheckoutRunner() {
  const router = useRouter();
  const { reducedMotion, effectsOn, setGlitterSuppressed } = useEffects();
  const [animating, setAnimating] = useState(false);
  const [target, setTarget] = useState<string | null>(null);

  const go = useCallback(
    (bookingId: string) => {
      setGlitterSuppressed(false);
      router.push(`/account/bookings/${bookingId}?from=checkout`);
    },
    [router, setGlitterSuppressed],
  );

  const start = useCallback(
    (p: CheckoutPayload) => {
      if (reducedMotion || !effectsOn) {
        go(p.bookingId);
        return;
      }
      setGlitterSuppressed(true);
      setTarget(p.bookingId);
      setAnimating(true);
    },
    [effectsOn, go, reducedMotion, setGlitterSuppressed],
  );

  const overlays = animating && target ? <BottlePop onDone={() => go(target)} /> : null;

  return { busy: animating, start, overlays };
}
