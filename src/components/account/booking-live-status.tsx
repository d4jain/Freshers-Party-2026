"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { BookingStatusView } from "@/lib/booking/status";
import { usePrefersReducedMotion } from "@/lib/hooks/client-state";
import { StatusChip } from "./status-chip";

/** Poll only while an organiser is reviewing the payment. */
const WAITING = (v: BookingStatusView) => v.status === "in_review";

function Celebration() {
  const reduce = usePrefersReducedMotion();
  const bits = Array.from({ length: 18 }, (_, i) => i);
  return (
    <div
      className="relative overflow-hidden rounded-[1.25rem] border border-gold/40 bg-[radial-gradient(120%_120%_at_50%_0%,rgba(215,183,119,0.25),transparent_60%),#120e19] px-6 py-10 text-center"
      role="status"
    >
      {!reduce &&
        bits.map((i) => (
          <motion.span
            key={i}
            aria-hidden="true"
            className="absolute top-1/2 left-1/2 h-2 w-2 rounded-full"
            style={{ background: ["#d7b777", "#f1dca7", "#f7f0e6", "#9b7be0"][i % 4] }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.6 }}
            animate={{
              x: Math.cos((i / 18) * Math.PI * 2) * (120 + (i % 3) * 40),
              y: Math.sin((i / 18) * Math.PI * 2) * (70 + (i % 4) * 20),
              opacity: 0,
              scale: 1,
            }}
            transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      <p className="eyebrow relative">Confirmed</p>
      <p className="display relative mt-3 text-[clamp(2.4rem,9vw,4.2rem)] text-ivory">
        You’re on the <em className="text-gold">guest list.</em>
      </p>
      <p className="relative mt-3 text-mist">See you on the dance floor.</p>
    </div>
  );
}

export function BookingLiveStatus({ initial, celebrate }: { initial: BookingStatusView; celebrate: boolean }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const tries = useRef(0);

  // Adopt fresh server data (after router.refresh) without an effect.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setView(initial);
  }

  useEffect(() => {
    if (!WAITING(view)) return;
    let stop = false;
    let timer: number;
    const poll = async () => {
      tries.current++;
      try {
        const res = await fetch(`/api/bookings/${view.id}`, { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { booking: BookingStatusView };
          if (stop) return;
          if (body.booking.status !== view.status) {
            setView(body.booking);
            if (body.booking.status === "confirmed") setJustConfirmed(true);
            router.refresh(); // loads passes (server-rendered)
            return;
          }
        }
      } catch {
        /* offline — keep trying */
      }
      if (!stop) timer = window.setTimeout(poll, Math.min(60_000, 10_000 + tries.current * 5_000));
    };
    timer = window.setTimeout(poll, 10_000);
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [view, router]);

  if (view.status === "confirmed" && (celebrate || justConfirmed)) return <Celebration />;

  return (
    <div className="card p-6" aria-live="polite">
      <div className="flex flex-wrap items-center gap-3">
        <StatusChip status={view.status} />
        {WAITING(view) && <LoaderCircle className="h-4 w-4 animate-spin text-gold" aria-label="Waiting for review" />}
      </div>
      <p className="display mt-4 text-3xl text-ivory sm:text-4xl">{view.headline}</p>
      <p className="mt-2 text-mist">{view.detail}</p>
      {view.reviewNote && (
        <p className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-[#ffd3cb]">
          Reason: {view.reviewNote}
        </p>
      )}
      {view.proof && (
        <p className="mt-4 text-sm text-muted">
          Transaction ID submitted: <span className="font-mono text-ivory">{view.proof.utr}</span>
        </p>
      )}
      {WAITING(view) && (
        <button
          type="button"
          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold"
          onClick={() => router.refresh()}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
        </button>
      )}
    </div>
  );
}
