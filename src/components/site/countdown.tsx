"use client";

import { SlidingNumber } from "@/components/motion-primitives/sliding-number";
import { useNow } from "@/lib/hooks/client-state";

type Props = {
  /** Configured start (ISO) or the event-day fallback 00:00 IST. */
  targetIso: string;
  endIso: string;
  hasStartTime: boolean;
  startLabel: string | null;
};

type Parts = { days: number; hours: number; minutes: number; seconds: number };

function split(ms: number): Parts {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3_600),
    minutes: Math.floor((total % 3_600) / 60),
    seconds: total % 60,
  };
}

/**
 * Renders placeholders on the server and first client pass (no hydration
 * mismatch), then ticks every second. Clamps at zero, never restarts, and
 * switches to event-day / ended copy.
 */
export function Countdown({ targetIso, endIso, hasStartTime, startLabel }: Props) {
  // null during SSR/hydration → placeholders, then ticks each second.
  const now = useNow(1000);
  const target = Date.parse(targetIso);
  const end = Date.parse(endIso);

  const phase = now == null ? "loading" : now < target ? "before" : now < end ? "live" : "ended";
  const parts = split(now == null ? 0 : target - now);

  const label = hasStartTime ? `Countdown to doors · ${startLabel}` : "Countdown to event day — start time TBA.";

  if (phase === "live") {
    return (
      <div className="text-center" role="status">
        <p className="eyebrow">It’s happening</p>
        <p className="display mt-4 text-5xl text-ivory sm:text-7xl">
          {hasStartTime ? <>It’s party time.</> : <>It’s event day.</>}
        </p>
        <p className="mt-4 text-mist">
          {hasStartTime ? "See you on the dance floor." : "Timing to be announced — check the WhatsApp group for entry details."}
        </p>
      </div>
    );
  }
  if (phase === "ended") {
    return (
      <div className="text-center" role="status">
        <p className="eyebrow">Freshers’ Party 2026</p>
        <p className="display mt-4 text-5xl text-ivory sm:text-7xl">That’s a wrap.</p>
        <p className="mt-4 text-mist">Thank you for making the night unforgettable.</p>
      </div>
    );
  }

  const units: [keyof Parts, string][] = [
    ["days", "Days"],
    ["hours", "Hours"],
    ["minutes", "Minutes"],
    ["seconds", "Seconds"],
  ];
  const summary =
    now == null ? "Loading countdown" : `${parts.days} days, ${parts.hours} hours and ${parts.minutes} minutes to go`;

  return (
    <div className="text-center">
      <p className="text-sm font-semibold tracking-wide text-gold sm:text-base">{label}</p>
      <div role="timer" aria-live="off" aria-label={summary} className="mt-6 grid grid-cols-4 gap-2 sm:gap-6">
        {units.map(([key, name]) => (
          <div key={key} className="relative rounded-2xl border border-gold/20 bg-ink-2/70 px-1 py-4 sm:py-6">
            <div className="display flex h-[1.05em] items-center justify-center text-[clamp(2.3rem,11vw,5.5rem)] leading-none text-gold tabular-nums">
              {now == null ? <span aria-hidden="true">--</span> : <SlidingNumber value={parts[key]} padStart />}
            </div>
            <p className="mt-2 text-[0.65rem] font-bold tracking-[0.22em] text-muted uppercase sm:text-xs">{name}</p>
          </div>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {now != null && parts.seconds === 0 ? summary : ""}
      </p>
    </div>
  );
}
