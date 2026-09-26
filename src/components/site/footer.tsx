import Link from "next/link";
import { EVENT_FACTS } from "@/config/event";
import { EffectsToggle } from "./effects-toggle";
import { Wordmark } from "./wordmark";

export function SiteFooter() {
  return (
    <footer className="border-t border-gold/15 bg-ink pt-14 pb-[calc(6rem+var(--safe-bottom))] lg:pb-12">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <Wordmark />
          <p className="mt-5 max-w-md text-sm leading-relaxed text-mist">{EVENT_FACTS.independentDisclosure}</p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
            Eligibility: first-year Bennett University students only. At booking, the booker confirms this for everyone in their
            group; it is a self-declaration, not an identity check.
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
              <Link className="hover:text-gold-bright" href="/privacy">
                Privacy policy
              </Link>
            </li>
            <li>
              <Link className="hover:text-gold-bright" href="/credits">
                Photo & asset credits
              </Link>
            </li>
          </ul>
        </nav>
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
