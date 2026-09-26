import { CalendarDays, Clock, GraduationCap, MapPin, MessageCircle } from "lucide-react";
import Link from "next/link";
import { STOCK } from "@/config/media";
import { eventTimingLabel, formatEventDate } from "@/lib/format";
import { formatINR } from "@/lib/money";
import type { PublicEvent } from "@/lib/public-settings";
import { HeroShell } from "./hero-shell";
import { HeroTitle } from "./hero-title";

export function Hero({ event }: { event: PublicEvent }) {
  const s = event.settings;
  return (
    <HeroShell image={STOCK.hero} video={s.heroVideo}>
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-end px-4 pt-28 pb-20 sm:px-6 lg:px-8 lg:pb-24">
        <p className="inline-flex w-fit items-center gap-2 rounded-full border border-gold/40 bg-ink/60 px-3.5 py-1.5 text-[0.78rem] font-bold text-gold-bright backdrop-blur">
          <GraduationCap className="h-4 w-4" aria-hidden="true" />
          Bennett University students only
        </p>

        <p className="mt-6 font-script text-3xl text-gold/90 sm:text-4xl" aria-hidden="true">
          welcome to
        </p>
        <div className="mt-1">
          <HeroTitle />
        </div>

        <p className="mt-5 max-w-xl font-display text-2xl leading-snug text-ivory/90 italic sm:text-3xl">
          Your people. Your first unforgettable night.
        </p>

        <ul className="mt-7 flex flex-col gap-2.5 text-[0.95rem] font-semibold text-mist sm:flex-row sm:flex-wrap sm:gap-x-7">
          <li className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-gold" aria-hidden="true" />
            <time dateTime={s.eventDate}>{formatEventDate(s.eventDate)}</time>
          </li>
          <li className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-gold" aria-hidden="true" />
            {s.venueName}, {s.venueBranch}
          </li>
          <li className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gold" aria-hidden="true" />
            {eventTimingLabel(s.startsAt, s.endsAt)}
          </li>
        </ul>

        <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-baseline gap-3">
              <span className="display text-6xl text-gold sm:text-7xl">{formatINR(s.unitPricePaise)}</span>
              <span className="text-base font-semibold text-mist">/ person</span>
            </p>
            <p className="mt-2 flex items-center gap-3 text-sm text-muted">
              {s.compareAtPricePaise && s.compareAtPricePaise > s.unitPricePaise && (
                <span>
                  <span className="sr-only">Was </span>
                  <s className="decoration-gold/70">{formatINR(s.compareAtPricePaise)}</s>
                </span>
              )}
              <span>Same price for everyone</span>
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/book" className="btn-gold min-h-14 px-8 text-lg">
              Book Your Spot
            </Link>
            <a href={event.whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost min-h-14">
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              Join WhatsApp
              <span className="sr-only"> group (opens WhatsApp)</span>
            </a>
          </div>
        </div>
      </div>
    </HeroShell>
  );
}
