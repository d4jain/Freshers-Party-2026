"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCheckoutRunner } from "@/components/booking/use-checkout";
import { FormAlert } from "@/components/ui/field";
import type { BookingStatusView } from "@/lib/booking/status";
import { useNow, usePrefersReducedMotion } from "@/lib/hooks/client-state";
import { StatusChip } from "./status-chip";

const UNRESOLVED = (v: BookingStatusView) =>
  v.status === "pending_payment" ||
  (v.status === "expired" && (v.paymentEvidence === "captured" || v.paymentEvidence === "authorized"));

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
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const runner = useCheckoutRunner();
  const tries = useRef(0);
  const now = useNow(15_000);

  // Adopt fresh server data (after router.refresh) without an effect.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setView(initial);
  }

  useEffect(() => {
    if (!UNRESOLVED(view)) return;
    let stop = false;
    let timer: number;
    const poll = async () => {
      tries.current++;
      try {
        const res = await fetch(`/api/bookings/${view.id}`, { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { booking: BookingStatusView };
          if (stop) return;
          if (body.booking.status !== view.status || body.booking.paymentEvidence !== view.paymentEvidence) {
            setView(body.booking);
            if (body.booking.status === "confirmed") {
              setJustConfirmed(true);
              router.refresh(); // loads passes (server-rendered)
            }
            return;
          }
        }
      } catch {
        /* offline — keep trying */
      }
      if (!stop) timer = window.setTimeout(poll, Math.min(15_000, 2_500 + tries.current * 1_000));
    };
    timer = window.setTimeout(poll, 2_000);
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [view, router]);

  const holdLive = now != null && new Date(view.holdExpiresAt).getTime() > now;
  const canResume =
    view.status === "pending_payment" && holdLive && view.paymentEvidence !== "captured" && view.paymentEvidence !== "authorized";

  async function resume() {
    setResuming(true);
    setResumeError(null);
    try {
      const res = await fetch(`/api/bookings/${view.id}/resume`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const body = await res.json();
      if (!res.ok) {
        setResumeError(body.error?.message ?? "Couldn’t reopen checkout.");
        return;
      }
      runner.start(body.checkout);
    } catch {
      setResumeError("Network problem — nothing was charged. Try again.");
    } finally {
      setResuming(false);
    }
  }

  if (view.status === "confirmed" && (celebrate || justConfirmed)) return <Celebration />;

  return (
    <div className="space-y-4">
      <div className="card p-6" aria-live="polite">
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip status={view.status} />
          {UNRESOLVED(view) && <LoaderCircle className="h-4 w-4 animate-spin text-gold" aria-label="Checking" />}
        </div>
        <p className="display mt-4 text-3xl text-ivory sm:text-4xl">{view.headline}</p>
        <p className="mt-2 text-mist">{view.detail}</p>
        {canResume && (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              className="btn-gold"
              onClick={() => void resume()}
              disabled={resuming || runner.phase === "animating" || runner.phase === "open"}
            >
              {resuming ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Complete payment
            </button>
            <span className="text-sm text-muted">
              Places held until{" "}
              {new Date(view.holdExpiresAt).toLocaleTimeString("en-IN", {
                hour: "numeric",
                minute: "2-digit",
                timeZone: "Asia/Kolkata",
              })}{" "}
              IST
            </span>
          </div>
        )}
        {UNRESOLVED(view) && !canResume && (
          <button
            type="button"
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold"
            onClick={() => router.refresh()}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </button>
        )}
      </div>
      {resumeError && <FormAlert>{resumeError}</FormAlert>}
      {runner.paymentNote && <FormAlert tone="info">{runner.paymentNote}</FormAlert>}
      {runner.phase === "sdk_error" && (
        <FormAlert>
          We couldn’t load secure checkout.{" "}
          <button type="button" className="font-bold underline" onClick={runner.retrySdk}>
            Retry
          </button>
        </FormAlert>
      )}
      {runner.overlays}
    </div>
  );
}
