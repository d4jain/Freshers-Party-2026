import { Gift } from "lucide-react";
import Link from "next/link";
import { REFERRAL_TIERS } from "@/config/referrals";
import { formatINR } from "@/lib/money";

/** Homepage "Refer Now" teaser; the code, sharing and progress live on /account/refer. */
export function ReferNow() {
  return (
    <div className="invite-frame relative grid gap-8 overflow-hidden p-6 sm:p-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
      <div className="relative">
        <p className="eyebrow">Refer Now</p>
        <h2 id="refer-title" className="display mt-4 text-[clamp(2.6rem,9vw,5rem)] text-ivory">
          Bring your batch. <em className="text-gold">Get cashback.</em>
        </h2>
        <p className="mt-4 max-w-md text-mist">
          Get your own referral code and share it on WhatsApp or Instagram. When friends book with it and come to the party, you
          earn cashback — paid at the party in cash or UPI.
        </p>
        <Link href="/account/refer" className="btn-gold mt-7 min-h-14 px-8">
          <Gift className="h-5 w-5" aria-hidden="true" /> Get my referral code
        </Link>
      </div>
      <ul className="relative grid grid-cols-2 gap-3">
        {REFERRAL_TIERS.map((t, i) => (
          <li key={t.min} className="rounded-2xl border border-gold/25 bg-ink/50 p-4 text-center sm:p-5">
            <p className="display text-4xl text-gold sm:text-5xl">{formatINR(t.rewardPaise)}</p>
            <p className="mt-1 text-sm text-mist">
              {t.min}
              {i === REFERRAL_TIERS.length - 1 ? "+" : ""} friends attend
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
