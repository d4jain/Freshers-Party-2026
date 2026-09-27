import { desc, eq } from "drizzle-orm";
import { ChevronRight, Gift, ScanLine, Shield } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton } from "@/components/account/sign-out-button";
import { StatusChip } from "@/components/account/status-chip";
import { ResendVerification } from "@/components/auth/password-forms";
import { PageShell, PageTitle } from "@/components/site/page-shell";
import { FormAlert } from "@/components/ui/field";
import { WhatsAppCta } from "@/components/ui/whatsapp-cta";
import { REFERRAL_TIERS } from "@/config/referrals";
import { requireUserPage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { bookings } from "@/lib/db/schema";
import { formatDateTimeIST } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { formatIndianMobile } from "@/lib/phone";
import { getPublicEvent } from "@/lib/public-settings";

export const metadata: Metadata = { title: "My account", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage(props: PageProps<"/account">) {
  const user = await requireUserPage("/account");
  const sp = await props.searchParams;
  const event = await getPublicEvent();
  const rows = await getDb()
    .select()
    .from(bookings)
    .where(eq(bookings.userId, user.id))
    .orderBy(desc(bookings.createdAt))
    .limit(50);

  return (
    <PageShell width="max-w-4xl">
      <PageTitle
        eyebrow="My account"
        title={
          <>
            Hey, <em className="text-gold">{user.name.split(" ")[0]}</em>
          </>
        }
      >
        {user.email} · {formatIndianMobile(user.phone)}
      </PageTitle>

      {sp.denied && (
        <div className="mb-6">
          <FormAlert>You don’t have access to that page.</FormAlert>
        </div>
      )}
      {!user.emailVerified && env().REQUIRE_EMAIL_VERIFICATION && (
        <div className="mb-6">
          <FormAlert tone="info">
            Please verify your email — you’ll need it to pay, and it’s where your confirmation goes.
            <span className="mt-3 block">
              <ResendVerification email={user.email} />
            </span>
          </FormAlert>
        </div>
      )}

      <WhatsAppCta href={event.whatsappUrl} className="mb-6" />

      <Link
        href="/account/refer"
        className="card mb-10 flex items-center justify-between gap-4 p-5 transition-colors hover:border-gold/50"
      >
        <span className="flex items-center gap-4">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold/40 text-gold">
            <Gift className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-display text-2xl text-ivory">Refer Now</span>
            <span className="block text-sm text-mist">
              Get your code, invite friends, earn up to {formatINR(REFERRAL_TIERS[REFERRAL_TIERS.length - 1]!.rewardPaise)}{" "}
              cashback.
            </span>
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
      </Link>

      <section aria-labelledby="bookings-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 id="bookings-title" className="display text-3xl text-ivory sm:text-4xl">
            My bookings
          </h2>
          <Link href="/book" className="btn-gold !min-h-11 text-sm">
            New booking
          </Link>
        </div>
        {rows.length === 0 ? (
          <div className="card p-6 text-mist">
            No bookings yet.{" "}
            <Link href="/book" className="font-semibold text-gold underline underline-offset-4">
              Book your spot
            </Link>
            .
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/account/bookings/${b.id}`}
                  className="card group flex items-center justify-between gap-4 p-5 transition hover:border-gold/40"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-xl text-ivory">{b.reference}</span>
                      <StatusChip status={b.status} />
                      {b.isDemo && (
                        <span className="rounded-full border border-dashed border-danger/60 px-2 py-0.5 text-[0.65rem] font-bold text-danger">
                          DEMO
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {b.quantityTotal} pass{b.quantityTotal === 1 ? "" : "es"} · {formatINR(b.totalPaise)} ·{" "}
                      {formatDateTimeIST(b.createdAt)}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-gold transition group-hover:translate-x-1" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-12 flex flex-wrap gap-3">
        {(user.role === "staff" || user.role === "admin") && (
          <Link href="/staff/check-in" className="btn-ghost">
            <ScanLine className="h-4 w-4" aria-hidden="true" /> Door check-in
          </Link>
        )}
        {user.role === "admin" && (
          <Link href="/admin" className="btn-ghost">
            <Shield className="h-4 w-4" aria-hidden="true" /> Organiser dashboard
          </Link>
        )}
        <SignOutButton />
      </div>
    </PageShell>
  );
}
