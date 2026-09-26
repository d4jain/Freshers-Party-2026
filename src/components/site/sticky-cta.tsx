"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Mobile booking bar. Appears after the hero, respects the safe area, and
 * never shows on pages with form controls. The footer reserves space for it.
 */
export function StickyBookingBar({ priceLabel }: { priceLabel: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("top");
    const end = document.getElementById("reach-out");
    if (!hero) return;
    let heroVisible = true;
    let endVisible = false;
    const update = () => setShow(!heroVisible && !endVisible);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.target === hero) heroVisible = e.isIntersecting;
          if (e.target === end) endVisible = e.isIntersecting;
        }
        update();
      },
      { threshold: 0.05 },
    );
    io.observe(hero);
    if (end) io.observe(end);
    return () => io.disconnect();
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-gold/20 bg-ink/90 px-4 pt-3 backdrop-blur-xl transition-transform duration-500 lg:hidden",
        show ? "translate-y-0" : "pointer-events-none translate-y-full",
      )}
      style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom))" }}
      aria-hidden={!show}
    >
      <div className="mx-auto flex max-w-xl items-center justify-between gap-4">
        <p className="leading-tight">
          <span className="display block text-2xl text-gold">{priceLabel}</span>
          <span className="text-xs text-muted">per person · Bennett only</span>
        </p>
        <Link href="/book" tabIndex={show ? 0 : -1} className="btn-gold">
          Book Your Spot
        </Link>
      </div>
    </div>
  );
}
