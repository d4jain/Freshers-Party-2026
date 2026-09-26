import Link from "next/link";
import { Countdown } from "@/components/site/countdown";
import { Experience } from "@/components/site/experience";
import { Faq, type FaqItem } from "@/components/site/faq";
import { SiteFooter } from "@/components/site/footer";
import { Gallery } from "@/components/site/gallery";
import { Hero } from "@/components/site/hero";
import { Marquee } from "@/components/site/marquee";
import { SiteNav } from "@/components/site/nav";
import { ReachOut } from "@/components/site/reach-out";
import { Reveal } from "@/components/site/reveal";
import { StickyBookingBar } from "@/components/site/sticky-cta";
import { TicketCard } from "@/components/site/ticket";
import { Venue } from "@/components/site/venue";
import { EVENT_DAY_END_ISO, EVENT_DAY_START_ISO, EVENT_FACTS } from "@/config/event";
import { eventTimingLabel, formatDateTimeIST, formatEventDate } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { getPublicEvent, type PublicEvent } from "@/lib/public-settings";

// Re-render at most once a minute; admin setting changes also revalidate "/".
export const revalidate = 60;

function faqItems(event: PublicEvent): FaqItem[] {
  const s = event.settings;
  return [
    {
      q: "Who can come?",
      a: (
        <p>
          Only first-year Bennett University students. When you book, you confirm that every person in your booking is a
          first-year Bennett student. That’s a self-declaration, not an identity check — entry details will be shared in the
          WhatsApp group.
        </p>
      ),
    },
    {
      q: "Is this an official university event?",
      a: <p>No. {EVENT_FACTS.independentDisclosure}</p>,
    },
    {
      q: "Can I book for my group?",
      a: (
        <p>
          Yes — up to {s.maxGroupSize} people per booking. Tell us how many girls and boys are coming; everyone pays the same{" "}
          {formatINR(s.unitPricePaise)} and gets their own QR pass in your account.
        </p>
      ),
    },
    {
      q: "How do I pay?",
      a: (
        <p>
          By UPI. After you review your order we show a QR code for the exact amount — pay with any UPI app (GPay, PhonePe,
          Paytm…), then upload the payment screenshot and its transaction ID. We never ask for your UPI PIN.
        </p>
      ),
    },
    {
      q: "When is my booking confirmed?",
      a: (
        <p>
          Once the organisers check your payment in their UPI account. Until then your booking shows as “In review” under{" "}
          <Link href="/account">My bookings</Link> and your places stay reserved. After approval your passes appear there and we
          email a confirmation. Please don’t pay twice.
        </p>
      ),
    },
    {
      q: "What time does it start?",
      a: (
        <p>
          {s.startsAt
            ? `${formatEventDate(s.eventDate)}, ${eventTimingLabel(s.startsAt, s.endsAt)}.`
            : `${formatEventDate(s.eventDate)}. Timing to be announced — watch the WhatsApp group for updates.`}
        </p>
      ),
    },
    {
      q: "Where is it?",
      a: (
        <p>
          {s.venueName}, {s.venueBranch}. {s.venueAddress ? `${s.venueAddress}.` : ""} See{" "}
          <Link href="#venue">venue details</Link> for directions.
        </p>
      ),
    },
    {
      q: "What’s included?",
      a: (
        <p>
          Unlimited food and unlimited drinks, plus party, dance and games.{" "}
          {s.drinksDetails ? s.drinksDetails : "The food and drinks menus haven’t been announced yet."}
        </p>
      ),
    },
    {
      q: "Can I cancel or get a refund?",
      a: s.refundPolicyText ? (
        <p>
          See the <Link href="/refund-policy">cancellation & refund policy</Link>. Approved refunds are sent back by the
          organisers via UPI.
        </p>
      ) : (
        <p>
          The organisers haven’t published the cancellation and refund policy yet. Online booking stays closed until it’s
          published, so you’ll always see it before you pay.
        </p>
      ),
    },
  ];
}

function Section({
  id,
  labelledBy,
  className,
  children,
}: {
  id: string;
  labelledBy?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={`scroll-mt-24 ${className ?? ""}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  );
}

function WaveDivider({ flip = false }: { flip?: boolean }) {
  return <div aria-hidden="true" className={`bg-wave h-16 w-full sm:h-24 ${flip ? "rotate-180" : ""}`} />;
}

export default async function HomePage() {
  const event = await getPublicEvent();
  const s = event.settings;
  const target = s.startsAt ? s.startsAt.toISOString() : EVENT_DAY_START_ISO;
  const end = s.endsAt ? s.endsAt.toISOString() : EVENT_DAY_END_ISO;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: EVENT_FACTS.name,
    // Date only: the start time hasn't been confirmed.
    startDate: s.startsAt ? s.startsAt.toISOString() : s.eventDate,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    description: "Freshers’ party for first-year Bennett University students. Independently organised; not a university event.",
    location: {
      "@type": "Place",
      name: `${s.venueName}, ${s.venueBranch}`,
      address: s.venueAddress ?? "Sector 142, Noida, Uttar Pradesh",
    },
    offers: { "@type": "Offer", price: (s.unitPricePaise / 100).toFixed(2), priceCurrency: "INR", url: "/book" },
  };

  return (
    <>
      <SiteNav />
      <main id="main">
        <Hero event={event} />

        <Section id="countdown" className="relative py-16 sm:py-24">
          <div
            className="bg-scatter pointer-events-none absolute inset-x-0 top-0 h-full bg-contain opacity-50"
            aria-hidden="true"
          />
          <Reveal>
            <Countdown
              targetIso={target}
              endIso={end}
              hasStartTime={Boolean(s.startsAt)}
              startLabel={s.startsAt ? formatDateTimeIST(s.startsAt) : null}
            />
          </Reveal>
        </Section>

        <Marquee />

        <Section id="experience" labelledBy="experience-title" className="py-20 sm:py-28">
          <Reveal>
            <div className="mb-10 flex flex-col gap-4 sm:mb-14 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="eyebrow">The Experience</p>
                <h2 id="experience-title" className="display mt-4 text-[clamp(2.8rem,10vw,6rem)] text-ivory">
                  One batch.
                  <br />
                  <em className="text-gold">One dance floor.</em>
                </h2>
              </div>
              <p className="max-w-sm text-mist">
                Unlimited food and drinks, a dance floor that doesn’t quit, and games to break the ice.
              </p>
            </div>
          </Reveal>
          <Experience drinksDetails={s.drinksDetails} />
        </Section>

        <WaveDivider flip />
        <Section id="venue" labelledBy="venue-title" className="bg-ink-2 py-16 sm:py-24">
          <Reveal>
            <Venue event={event} />
          </Reveal>
        </Section>
        <WaveDivider />

        <Section id="glimpses" labelledBy="glimpses-title" className="pt-20 pb-8 sm:pt-28 sm:pb-12">
          <Reveal>
            <p className="eyebrow">Glimpses</p>
            <h2 id="glimpses-title" className="display mt-4 mb-8 text-[clamp(2.6rem,9vw,5.5rem)] text-ivory">
              Set the <em className="text-gold">mood.</em>
            </h2>
          </Reveal>
          <Gallery approved={s.approvedMedia} />
        </Section>

        <Section id="tickets" labelledBy="tickets-title" className="py-16 sm:py-24">
          <Reveal>
            <p className="eyebrow">Tickets</p>
            <h2 id="tickets-title" className="display mt-4 mb-10 text-[clamp(2.6rem,9vw,5.5rem)] text-ivory">
              Your name, <em className="text-gold">on the list.</em>
            </h2>
          </Reveal>
          <TicketCard event={event} />
          {!event.salesOpen && event.salesMessage && (
            <p className="mt-6 rounded-2xl border border-gold/20 bg-ink-2 px-5 py-4 text-sm text-mist" role="note">
              {event.salesMessage} Join the WhatsApp group to hear the moment bookings open.
            </p>
          )}
        </Section>

        <Section id="faq" labelledBy="faq-title" className="py-16 sm:py-24">
          <div className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
            <Reveal>
              <p className="eyebrow">FAQ</p>
              <h2 id="faq-title" className="display mt-4 text-[clamp(2.6rem,9vw,5rem)] text-ivory">
                Good <em className="text-gold">questions.</em>
              </h2>
            </Reveal>
            <Faq items={faqItems(event)} />
          </div>
        </Section>

        <Section id="reach-out" labelledBy="reach-title" className="pb-20 sm:pb-28">
          <Reveal>
            <ReachOut event={event} />
          </Reveal>
        </Section>
      </main>
      <SiteFooter />
      <StickyBookingBar priceLabel={formatINR(s.unitPricePaise)} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </>
  );
}
