import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { BookingFlow } from "@/components/booking/booking-flow";
import { PageShell, PageTitle } from "@/components/site/page-shell";
import { FormAlert } from "@/components/ui/field";
import { getSessionUser } from "@/lib/auth/session";
import { isValidCodeFormat, normalizeCode } from "@/lib/codes";
import { getDb } from "@/lib/db";
import { bookings, user as userTable } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { eventTimingLabel, formatEventDate } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { getPublicEvent } from "@/lib/public-settings";

export const metadata: Metadata = { title: "Book your spot", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function BookPage(props: PageProps<"/book">) {
  const sp = await props.searchParams;
  const ref = normalizeCode(typeof sp.ref === "string" ? sp.ref : null);
  const initialReferralCode = ref && isValidCodeFormat(ref) ? ref : null;
  const event = await getPublicEvent();
  const s = event.settings;
  const session = await getSessionUser().catch(() => null);

  let userProps = null;
  let pending: { id: string; reference: string } | null = null;
  if (session) {
    const db = getDb();
    const [u] = await db.select().from(userTable).where(eq(userTable.id, session.id)).limit(1);
    if (u) {
      userProps = {
        name: u.name,
        email: u.email,
        phone: u.phone,
        emailVerified: u.emailVerified,
        signupReferralCode: u.signupReferralCode,
      };
      const [p] = await db
        .select({ id: bookings.id, reference: bookings.reference, holdExpiresAt: bookings.holdExpiresAt })
        .from(bookings)
        .where(and(eq(bookings.userId, u.id), eq(bookings.status, "pending_payment")))
        .limit(1);
      if (p && p.holdExpiresAt > new Date()) pending = { id: p.id, reference: p.reference };
    }
  }

  const e = env();
  const showSetupHint = !e.isProduction || session?.role === "admin";
  const salesOpen = event.salesOpen;
  let setupHint: string | null = null;
  if (!salesOpen && showSetupHint) {
    const { evaluateSales } = await import("@/lib/settings");
    const state = evaluateSales(s, { demo: event.demo }, new Date());
    setupHint = !state.open ? (state.setupHint ?? null) : null;
    if (event.source === "fallback") setupHint = "The database isn’t reachable, so booking is disabled. Check DATABASE_URL.";
  }

  return (
    <PageShell width="max-w-6xl">
      <div className="grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:gap-14">
        <div>
          <PageTitle
            eyebrow="Book your spot"
            title={
              <>
                Freshers’ Party <em className="text-gold">2026</em>
              </>
            }
          >
            {formatEventDate(s.eventDate)} · {s.venueName}, {s.venueBranch} · {eventTimingLabel(s.startsAt, s.endsAt)}
          </PageTitle>
          {pending && (
            <div className="mb-6">
              <FormAlert tone="info">
                You have a booking waiting for payment proof ({pending.reference}).{" "}
                <Link href={`/account/bookings/${pending.id}`} className="font-bold text-gold underline underline-offset-4">
                  Continue that payment
                </Link>{" "}
                or start a new one below (the old hold will be released).
              </FormAlert>
            </div>
          )}
          {!salesOpen && (
            <div className="mb-6">
              <FormAlert tone="info">
                {event.salesMessage ?? "Booking isn’t open."} Join the WhatsApp group to hear when it opens.
                {setupHint && <span className="mt-1 block text-xs text-muted">Setup: {setupHint}</span>}
              </FormAlert>
            </div>
          )}
          <div className="invite-frame relative p-5 sm:p-8">
            <BookingFlow
              user={userProps}
              config={{
                unitPricePaise: s.unitPricePaise,
                compareAtPricePaise: s.compareAtPricePaise,
                bookingFeePaise: s.bookingFeePaise,
                bookingFeeLabel: s.bookingFeeLabel,
                maxGroupSize: s.maxGroupSize,
                policyVersion: s.policyVersion,
                holdMinutes: s.holdMinutes,
              }}
              sales={{ open: salesOpen, message: event.salesMessage, setupHint }}
              demo={event.demo}
              requireVerifiedEmail={e.REQUIRE_EMAIL_VERIFICATION}
              initialReferralCode={initialReferralCode}
            />
          </div>
        </div>
        <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
          <div className="card p-6">
            <p className="eyebrow">Per person</p>
            <p className="mt-2 flex items-baseline gap-3">
              <span className="display text-5xl text-gold">{formatINR(s.unitPricePaise)}</span>
              {s.compareAtPricePaise && s.compareAtPricePaise > s.unitPricePaise && (
                <s className="text-muted">
                  <span className="sr-only">was </span>
                  {formatINR(s.compareAtPricePaise)}
                </s>
              )}
            </p>
            <ul className="mt-5 space-y-2 text-sm text-mist">
              <li>Unlimited Food + Unlimited Drinks</li>
              <li>Party | Dance | Games</li>
              <li>Same price for boys and girls</li>
              <li>One QR pass per person, in your account</li>
            </ul>
          </div>
          <div className="card p-6 text-sm text-mist">
            <p className="font-semibold text-ivory">How it works</p>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>Choose your group and review the total.</li>
              <li>
                Pay the exact amount to our UPI QR within {s.holdMinutes} minutes, then upload the screenshot and transaction ID.
              </li>
              <li>The organisers verify your payment; once approved, your passes appear in your account.</li>
            </ol>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
