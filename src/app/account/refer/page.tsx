import { Check, Gift } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ReferShare } from "@/components/account/refer-share";
import { PageShell, PageTitle } from "@/components/site/page-shell";
import { REFERRAL_TIERS } from "@/config/referrals";
import { requireUserPage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { appOrigin } from "@/lib/env";
import { formatEventDate } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { getPublicEvent } from "@/lib/public-settings";
import { getOrCreateUserReferralCode, referralProgress } from "@/lib/referrals";

export const metadata: Metadata = { title: "Refer Now", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ReferPage() {
  const user = await requireUserPage("/account/refer");
  const db = getDb();
  const [code, event] = await Promise.all([getOrCreateUserReferralCode(db, user), getPublicEvent()]);
  const progress = await referralProgress(db, code.id);
  const s = event.settings;

  const link = `${appOrigin()}/book?ref=${code.code}`;
  const message =
    `🎉 Freshers’ Party 2026 — ${formatEventDate(s.eventDate)} at ${s.venueName}, ${s.venueBranch}!\n` +
    `Unlimited food + unlimited drinks · Party | Dance | Games. For Bennett University students.\n\n` +
    `Book your spot with my referral code ${code.code}:\n${link}`;

  const top = REFERRAL_TIERS[REFERRAL_TIERS.length - 1]!;
  const target = progress.next ?? top;
  const pct = Math.min(100, Math.round((progress.attended / target.min) * 100));

  return (
    <PageShell width="max-w-3xl">
      <Link href="/account" className="text-sm font-semibold text-gold">
        ← My account
      </Link>
      <div className="mt-6">
        <PageTitle
          eyebrow="Refer Now"
          title={
            <>
              Bring your batch. <em className="text-gold">Get cashback.</em>
            </>
          }
        >
          Share your code with friends. When they book with it and come to the party, you earn up to {formatINR(top.rewardPaise)}{" "}
          cashback — paid to you at the party in cash or UPI.
        </PageTitle>
      </div>

      <section aria-labelledby="code-title" className="invite-frame relative p-6 sm:p-8">
        <p id="code-title" className="eyebrow relative">
          Your referral code
        </p>
        <div className="relative mt-4">
          <ReferShare code={code.code} link={link} message={message} />
        </div>
      </section>

      <section aria-labelledby="progress-title" className="card mt-8 p-6 sm:p-8">
        <h2 id="progress-title" className="display text-3xl text-ivory">
          Your progress
        </h2>
        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-gold/15 p-4">
            <dt className="text-xs text-muted">Friends booked</dt>
            <dd className="display mt-1 text-4xl text-ivory tabular-nums">{progress.confirmedPeople}</dd>
          </div>
          <div className="rounded-2xl border border-gold/15 p-4">
            <dt className="text-xs text-muted">Attended the party</dt>
            <dd className="display mt-1 text-4xl text-gold tabular-nums">{progress.attended}</dd>
          </div>
          <div className="col-span-2 rounded-2xl border border-gold/15 p-4 sm:col-span-1">
            <dt className="text-xs text-muted">Cashback earned</dt>
            <dd className="display mt-1 text-4xl text-ivory tabular-nums">{formatINR(progress.rewardPaise)}</dd>
            {progress.paidPaise > 0 && <dd className="mt-1 text-xs text-muted">{formatINR(progress.paidPaise)} paid to you</dd>}
          </div>
        </dl>

        <div className="mt-6">
          <div
            className="h-3 overflow-hidden rounded-full bg-ink-3"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={target.min}
            aria-valuenow={Math.min(progress.attended, target.min)}
            aria-label="Referrals attended towards your next reward"
          >
            <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-sm text-mist">
            {progress.next
              ? `${progress.next.min - progress.attended} more attending ${progress.next.min - progress.attended === 1 ? "friend" : "friends"} to reach ${formatINR(progress.next.rewardPaise)}.`
              : `You’ve reached the top reward of ${formatINR(top.rewardPaise)}. Legend.`}
          </p>
        </div>

        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {REFERRAL_TIERS.map((t, i) => {
            const reached = progress.attended >= t.min;
            const last = i === REFERRAL_TIERS.length - 1;
            return (
              <li
                key={t.min}
                className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
                  reached ? "border-gold bg-gold/10" : "border-gold/15"
                }`}
              >
                <span className="flex items-center gap-2 text-ivory">
                  {reached ? (
                    <Check className="h-4 w-4 text-gold" aria-label="Reached" />
                  ) : (
                    <Gift className="h-4 w-4 text-muted" aria-hidden="true" />
                  )}
                  {t.min}
                  {last ? " or more" : ""} friends attend
                </span>
                <span className="font-display text-2xl text-gold">{formatINR(t.rewardPaise)}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="rules-title" className="card mt-8 p-6 sm:p-8">
        <h2 id="rules-title" className="display text-3xl text-ivory">
          How it works
        </h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 leading-relaxed text-mist">
          <li>Share your code or booking link. Friends enter your code when they book (or sign up).</li>
          <li>
            A referral counts when your friend’s booking is confirmed <strong className="text-ivory">and</strong> they’re checked
            in at the party. Every person in a group booking counts.
          </li>
          <li>
            Your cashback is the highest level you reach — levels don’t add up. For example, 12 friends attending earns{" "}
            {formatINR(REFERRAL_TIERS[1].rewardPaise)}.
          </li>
          <li>The organisers pay your cashback at the party, in cash or UPI. Find them with this page open.</li>
          <li>You can’t use your own code, and cancelled bookings don’t count.</li>
        </ol>
      </section>
    </PageShell>
  );
}
