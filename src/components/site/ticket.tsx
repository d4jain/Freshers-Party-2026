import { Check, Users } from "lucide-react";
import Link from "next/link";
import { EVENT_FACTS } from "@/config/event";
import { formatEventDate } from "@/lib/format";
import { formatINR } from "@/lib/money";
import type { PublicEvent } from "@/lib/public-settings";

export function TicketCard({ event }: { event: PublicEvent }) {
  const s = event.settings;
  const inclusions = [...EVENT_FACTS.highlights, "Same price for boys and girls", "One QR pass per person"];
  return (
    <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:items-stretch">
      <article className="invite-frame relative overflow-hidden p-7 sm:p-10" aria-labelledby="ticket-title">
        <div className="bg-aura pointer-events-none absolute -top-24 -right-24 h-72 w-72 opacity-80" aria-hidden="true" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">General entry</p>
            <h3 id="ticket-title" className="display mt-3 text-4xl text-ivory sm:text-5xl">
              Freshers’ Pass
            </h3>
            <p className="mt-2 text-sm text-muted">
              {formatEventDate(s.eventDate)} · {s.venueName}, {s.venueBranch}
            </p>
          </div>
          <span className="rounded-full border border-gold/40 px-3 py-1 text-[0.7rem] font-bold tracking-[0.2em] text-gold uppercase">
            Admit one
          </span>
        </div>

        <div className="relative my-8 flex items-center" aria-hidden="true">
          <span className="-ml-10 h-6 w-6 rounded-full bg-ink sm:-ml-13" />
          <span className="h-px flex-1 border-t border-dashed border-gold/40" />
          <span className="-mr-10 h-6 w-6 rounded-full bg-ink sm:-mr-13" />
        </div>

        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="flex items-baseline gap-3">
              <span className="display text-6xl text-gold sm:text-7xl">{formatINR(s.unitPricePaise)}</span>
              <span className="font-semibold text-mist">per person</span>
            </p>
            {s.compareAtPricePaise && s.compareAtPricePaise > s.unitPricePaise && (
              <p className="mt-1 text-sm text-muted">
                <span className="sr-only">Previously </span>
                <s className="decoration-gold/70">{formatINR(s.compareAtPricePaise)}</s>
              </p>
            )}
          </div>
          <Link href="/book" className="btn-gold min-h-14 px-8 text-lg">
            Book Your Spot
          </Link>
        </div>

        <ul className="relative mt-8 grid gap-3 sm:grid-cols-2">
          {inclusions.map((item) => (
            <li key={item} className="flex items-start gap-3 text-[0.95rem] text-mist">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p className="relative mt-6 text-xs leading-relaxed text-muted">
          Bennett University students only.{" "}
          {s.bookingFeePaise > 0
            ? `A ${formatINR(s.bookingFeePaise)} ${s.bookingFeeLabel ?? "booking fee"} applies per order. `
            : "No booking fee. "}
          You’ll see the full itemised total before you pay.
        </p>
      </article>

      <aside className="card flex flex-col justify-between gap-8 p-7 sm:p-10" aria-labelledby="group-title">
        <div>
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-gold/40 text-gold">
            <Users className="h-5 w-5" aria-hidden="true" />
          </span>
          <h3 id="group-title" className="display mt-6 text-4xl text-ivory">
            Coming as a <em className="text-gold">group?</em>
          </h3>
          <p className="mt-4 leading-relaxed text-mist">
            Book up to {s.maxGroupSize} people in one go. Tell us how many girls and boys are coming — the price is the same for
            everyone, and each person gets their own pass.
          </p>
        </div>
        <Link href="/book" className="btn-ghost w-full sm:w-fit">
          Book for your group
        </Link>
      </aside>
    </div>
  );
}
