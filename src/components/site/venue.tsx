import { ExternalLink, MapPin, Navigation } from "lucide-react";
import type { PublicEvent } from "@/lib/public-settings";

export function Venue({ event }: { event: PublicEvent }) {
  const s = event.settings;
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
      <div>
        <p className="eyebrow">The Venue</p>
        <h2 id="venue-title" className="display mt-4 text-[clamp(3rem,12vw,6.5rem)] text-ivory">
          {s.venueName}
        </h2>
        <p className="display mt-1 text-3xl text-gold italic sm:text-4xl">{s.venueBranch}</p>
        {s.venueAddress && (
          <address className="mt-6 flex max-w-lg gap-3 leading-relaxed text-mist not-italic">
            <MapPin className="mt-1 h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
            <span>{s.venueAddress}</span>
          </address>
        )}
        <p className="mt-4 max-w-lg text-sm text-muted">
          Rubarru has several outlets. This party is at the <strong className="text-mist">Advant Navis Park</strong> branch in
          Sector 142 — not the corporate office or any other outlet.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a href={event.directionsUrl} target="_blank" rel="noopener noreferrer" className="btn-gold">
            <Navigation className="h-4 w-4" aria-hidden="true" />
            Get directions
            <span className="sr-only"> (opens Google Maps)</span>
          </a>
          {s.venueWebsite && (
            <a href={s.venueWebsite} target="_blank" rel="noopener noreferrer" className="btn-ghost">
              Venue website
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only"> (opens rubarru.com)</span>
            </a>
          )}
        </div>
        {!event.mapIsVerifiedPin && (
          <p className="mt-4 max-w-lg text-xs text-muted">
            Directions open a Google Maps search for the venue. The exact map pin hasn’t been verified by the organisers yet —
            double-check you’re heading to Advant Navis Park, Sector 142.
          </p>
        )}
      </div>

      {/* Decorative illustration — not a map */}
      <figure
        className="invite-frame relative aspect-[4/3] overflow-hidden p-0"
        aria-label="Illustration of the venue location (not a map)"
      >
        <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M24 0H0V24" fill="none" stroke="#d7b777" strokeOpacity="0.08" />
            </pattern>
            <radialGradient id="pinGlow">
              <stop offset="0" stopColor="#d7b777" stopOpacity="0.55" />
              <stop offset="1" stopColor="#d7b777" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="400" height="300" fill="url(#grid)" />
          <path
            d="M-20 250 C 80 220, 160 200, 230 150 S 360 60, 430 40"
            fill="none"
            stroke="#7445cc"
            strokeOpacity="0.55"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M-20 250 C 80 220, 160 200, 230 150 S 360 60, 430 40"
            fill="none"
            stroke="#f7f0e6"
            strokeOpacity="0.25"
            strokeWidth="1"
            strokeDasharray="6 8"
          />
          <path d="M60 -10 C 90 80, 140 160, 150 320" fill="none" stroke="#3a55d8" strokeOpacity="0.35" strokeWidth="4" />
          <circle cx="230" cy="150" r="60" fill="url(#pinGlow)" />
          <g transform="translate(230 150)">
            <path
              d="M0 -34 C 14 -34 22 -24 22 -13 C 22 2 0 18 0 18 C 0 18 -22 2 -22 -13 C -22 -24 -14 -34 0 -34Z"
              fill="#d7b777"
            />
            <circle cy="-14" r="7" fill="#09070d" />
          </g>
        </svg>
        <figcaption className="absolute right-5 bottom-4 left-5 flex flex-wrap items-end justify-between gap-2 text-xs">
          <span className="rounded-full border border-gold/30 bg-ink/70 px-3 py-1 font-semibold text-gold-bright backdrop-blur">
            Sector 142 · Noida–Greater Noida Expressway
          </span>
          <span className="text-muted">Illustration, not to scale</span>
        </figcaption>
      </figure>
    </div>
  );
}
