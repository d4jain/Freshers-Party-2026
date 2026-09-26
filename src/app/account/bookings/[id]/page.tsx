import { asc, eq } from "drizzle-orm";
import { Download, Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { BookingLiveStatus } from "@/components/account/booking-live-status";
import { PaymentPanel } from "@/components/account/payment-panel";
import { PrintButton } from "@/components/account/print-button";
import { OrderSummary } from "@/components/booking/order-summary";
import { PageShell } from "@/components/site/page-shell";
import { WhatsAppCta } from "@/components/ui/whatsapp-cta";
import { requireUserPage } from "@/lib/auth/session";
import { getBookingStatusForUser } from "@/lib/booking/status";
import { getDb } from "@/lib/db";
import { tickets } from "@/lib/db/schema";
import { ticketSigningSecret } from "@/lib/env";
import { eventTimingLabel, formatDateTimeIST, formatEventDate } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { upiDetails, upiPayLink } from "@/lib/payments/upi";
import { getPublicEvent } from "@/lib/public-settings";
import { formatManualCode, qrPayloadFor } from "@/lib/tickets/token";

export const metadata: Metadata = { title: "Booking", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function BookingPage(props: PageProps<"/account/bookings/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const user = await requireUserPage(`/account/bookings/${id}`);
  const db = getDb();
  const view = await getBookingStatusForUser(db, user.id, id);
  if (!view) notFound();
  const event = await getPublicEvent();
  const s = event.settings;
  const upi = upiDetails(s);

  const passes =
    view.status === "confirmed"
      ? await Promise.all(
          (await db.select().from(tickets).where(eq(tickets.bookingId, view.id)).orderBy(asc(tickets.ticketIndex))).map(
            async (t) => ({
              id: t.id,
              index: t.ticketIndex,
              status: t.status,
              isDemo: t.isDemo,
              checkedInAt: t.checkedInAt,
              manualCode: formatManualCode(t.manualCode),
              qrSvg:
                t.status === "valid"
                  ? await QRCode.toString(qrPayloadFor(ticketSigningSecret(), t.publicId), {
                      type: "svg",
                      margin: 1,
                      errorCorrectionLevel: "M",
                      color: { dark: "#09070D", light: "#F7F0E6" },
                    })
                  : null,
            }),
          ),
        )
      : [];

  const holderFirst = user.name.split(" ")[0];

  return (
    <PageShell width="max-w-4xl">
      <nav className="mb-6 text-sm print:hidden" aria-label="Breadcrumb">
        <Link href="/account" className="font-semibold text-gold underline-offset-4 hover:underline">
          ← My bookings
        </Link>
      </nav>
      <header className="mb-8 print:hidden">
        <p className="eyebrow">Booking {view.reference}</p>
        {view.isDemo && (
          <p className="mt-3 inline-block rounded-full border border-dashed border-danger/60 px-3 py-1 text-xs font-bold text-danger">
            DEMO BOOKING — passes not valid for entry
          </p>
        )}
      </header>

      <div className="print:hidden">
        <BookingLiveStatus initial={view} celebrate={sp.from === "checkout"} />
        {(view.status === "pending_payment" || view.status === "expired") && (
          <div className="mt-6">
            <PaymentPanel
              bookingId={view.id}
              reference={view.reference}
              totalPaise={view.totalPaise}
              holdExpiresAt={view.holdExpiresAt}
              expired={view.status === "expired" || new Date(view.holdExpiresAt) <= new Date()}
              upi={{
                ...upi,
                payLink: upi.upiId
                  ? upiPayLink({
                      upiId: upi.upiId,
                      payeeName: upi.payeeName,
                      amountPaise: view.totalPaise,
                      reference: view.reference,
                    })
                  : null,
              }}
            />
          </div>
        )}
      </div>

      {view.status === "confirmed" && (
        <>
          <div className="mt-8 print:hidden">
            <WhatsAppCta href={event.whatsappUrl} />
          </div>

          <section aria-labelledby="passes-title" className="mt-12">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4 print:hidden">
              <h2 id="passes-title" className="display text-3xl text-ivory sm:text-4xl">
                Your passes
              </h2>
              <PrintButton />
            </div>
            <p className="mb-6 text-sm text-muted print:hidden">
              One pass per person. Share each pass with its guest; each QR can be scanned once at the door. Don’t post them
              publicly.
            </p>
            <ul className="grid gap-5 sm:grid-cols-2 print:grid-cols-2">
              {passes.map((p) => (
                <li key={p.id} className="invite-frame relative break-inside-avoid overflow-hidden p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="eyebrow">
                        Pass {p.index} of {view.quantityTotal}
                      </p>
                      <p className="display mt-2 text-2xl text-ivory">Freshers’ Party 2026</p>
                      <p className="mt-1 text-xs text-muted">
                        {formatEventDate(s.eventDate)} · {eventTimingLabel(s.startsAt, s.endsAt)}
                      </p>
                      <p className="text-xs text-muted">
                        {s.venueName}, {s.venueBranch}
                      </p>
                    </div>
                    {p.isDemo && (
                      <span className="rounded-full border border-dashed border-danger/70 px-2 py-0.5 text-[0.6rem] font-bold text-danger">
                        DEMO
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex items-center gap-4">
                    {p.qrSvg ? (
                      <div
                        className="w-36 shrink-0 overflow-hidden rounded-xl bg-ivory p-1.5"
                        role="img"
                        aria-label={`QR code for pass ${p.index}`}
                        dangerouslySetInnerHTML={{ __html: p.qrSvg }}
                      />
                    ) : (
                      <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-xl border border-danger/40 text-sm font-bold text-danger">
                        VOID
                      </div>
                    )}
                    <div className="min-w-0 text-sm">
                      <p className="text-muted">Booked by</p>
                      <p className="font-semibold text-ivory">{holderFirst}</p>
                      <p className="mt-2 text-muted">Manual code</p>
                      <p className="font-mono text-base tracking-wider text-gold-bright">{p.manualCode}</p>
                      {p.checkedInAt && (
                        <p className="mt-2 text-xs text-success">Checked in {formatDateTimeIST(p.checkedInAt)}</p>
                      )}
                    </div>
                  </div>
                  {p.qrSvg && (
                    <a
                      href={`/api/tickets/${p.id}/pass`}
                      className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-gold print:hidden"
                      download
                    >
                      <Download className="h-4 w-4" aria-hidden="true" /> Download pass
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section aria-labelledby="summary-title" className="mt-12 print:hidden">
        <h2 id="summary-title" className="display mb-4 text-2xl text-ivory">
          Order summary
        </h2>
        <div className="card p-5">
          <OrderSummary breakdown={view.breakdown} girls={view.quantityGirls} boys={view.quantityBoys} />
          <dl className="mt-5 grid gap-2 border-t border-gold/10 pt-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Reference</dt>
              <dd className="text-ivory">{view.reference}</dd>
            </div>
            <div>
              <dt className="text-muted">Booked</dt>
              <dd className="text-ivory">{formatDateTimeIST(view.createdAt)}</dd>
            </div>
            {view.confirmedAt && (
              <div>
                <dt className="text-muted">Confirmed</dt>
                <dd className="text-ivory">{formatDateTimeIST(view.confirmedAt)}</dd>
              </div>
            )}
            {view.status === "confirmed" && (
              <div>
                <dt className="text-muted">Amount paid</dt>
                <dd className="text-ivory">{formatINR(view.totalPaise)}</dd>
              </div>
            )}
            {view.couponCode && (
              <div>
                <dt className="text-muted">Coupon</dt>
                <dd className="text-ivory">{view.couponCode}</dd>
              </div>
            )}
            {view.referralCode && (
              <div>
                <dt className="text-muted">Referral</dt>
                <dd className="text-ivory">{view.referralCode}</dd>
              </div>
            )}
          </dl>
        </div>
      </section>
      <p className="mt-6 hidden text-xs text-muted print:block">
        <Printer className="mr-1 inline h-3 w-3" aria-hidden="true" /> Printed pass — each QR admits one person once.
      </p>
    </PageShell>
  );
}
