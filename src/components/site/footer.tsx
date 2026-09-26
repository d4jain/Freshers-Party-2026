import { AtSign, Mail, MessageCircle } from "lucide-react";
import Link from "next/link";
import { CONTACT_DEFAULTS, EVENT_FACTS } from "@/config/event";
import { EffectsToggle } from "./effects-toggle";
import { Wordmark } from "./wordmark";

export function SiteFooter() {
  return (
    <footer className="border-t border-gold/15 bg-ink pt-14 pb-[calc(6rem+var(--safe-bottom))] lg:pb-12">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <Wordmark />
          <p className="mt-5 max-w-md text-sm leading-relaxed text-mist">{EVENT_FACTS.independentDisclosure}</p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
            Eligibility: Bennett University students only. At booking, the booker confirms this for everyone in their group. Carry
            your college ID — it may be checked at entry.
          </p>
        </div>
        <nav aria-label="Policies" className="text-sm">
          <p className="eyebrow">Policies</p>
          <ul className="mt-4 space-y-3 text-mist">
            <li>
              <Link className="hover:text-gold-bright" href="/terms">
                Event terms
              </Link>
            </li>
            <li>
              <Link className="hover:text-gold-bright" href="/refund-policy">
                Cancellation & refund policy
              </Link>
            </li>
            <li>
              <Link className="hover:text-gold-bright" href="/credits">
                Photo & asset credits
              </Link>
            </li>
          </ul>
        </nav>
        {/* Static defaults so every page can render without a database read; the homepage "Reach out" section reads live settings. */}
        <div className="text-sm">
          <p className="eyebrow">Contact us</p>
          <ul className="mt-4 space-y-3 text-mist">
            <li>
              <a
                className="inline-flex items-center gap-2 break-all hover:text-gold-bright"
                href={`mailto:${CONTACT_DEFAULTS.email}`}
              >
                <Mail className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                {CONTACT_DEFAULTS.email}
              </a>
            </li>
            <li>
              <a
                className="inline-flex items-center gap-2 hover:text-gold-bright"
                href={CONTACT_DEFAULTS.instagram}
                target="_blank"
                rel="noopener noreferrer"
              >
                <AtSign className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                @bufreshers_26
                <span className="sr-only"> on Instagram (opens in a new tab)</span>
              </a>
            </li>
            <li>
              <a
                className="inline-flex items-center gap-2 hover:text-gold-bright"
                href={EVENT_FACTS.whatsappGroupUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                WhatsApp group
                <span className="sr-only"> (opens WhatsApp)</span>
              </a>
            </li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="eyebrow">Your account</p>
          <ul className="mt-4 space-y-3 text-mist">
            <li>
              <Link className="hover:text-gold-bright" href="/book">
                Book your spot
              </Link>
            </li>
            <li>
              <Link className="hover:text-gold-bright" href="/account">
                My bookings & passes
              </Link>
            </li>
          </ul>
          <div className="mt-6">
            <EffectsToggle />
          </div>
        </div>
      </div>
      <p className="mx-auto mt-12 max-w-7xl px-4 text-xs text-muted sm:px-6 lg:px-8">
        © 2026 {EVENT_FACTS.name}. Not affiliated with Bennett University.
      </p>
    </footer>
  );
}
