import Link from "next/link";
import { overviewStats } from "@/lib/admin/queries";
import { getDb } from "@/lib/db";
import { isDemoMode } from "@/lib/env";
import { formatDateTimeIST } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { effectiveCapacity, getSettings } from "@/lib/settings";

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-ivory/10 bg-ink-2 p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-sans text-2xl font-semibold text-ivory">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

export default async function AdminOverview() {
  const db = getDb();
  const [stats, settings] = await Promise.all([overviewStats(db), getSettings(db)]);
  const demo = isDemoMode();
  const capacity = effectiveCapacity(settings, demo);
  const pct = capacity ? Math.min(100, Math.round((stats.placesInUse / capacity) * 100)) : null;
  const meterColor = pct == null ? "bg-ivory/20" : pct >= 95 ? "bg-danger" : pct >= 80 ? "bg-gold-bright" : "bg-gold";

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-ivory">Overview</h1>
          <p className="mt-1 text-sm text-muted">
            Live figures exclude demo bookings. Settings v{settings.version}, updated {formatDateTimeIST(settings.updatedAt)}.
          </p>
        </div>
        <a href="/admin/export" className="btn-ghost !min-h-11 text-sm">
          Export bookings (CSV)
        </a>
      </header>

      {stats.inReview > 0 && (
        <div className="rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm text-gold-bright" role="status">
          <strong>{stats.inReview}</strong> payment{stats.inReview === 1 ? "" : "s"} waiting for review (
          {formatINR(stats.inReviewTotalPaise)}).{" "}
          <Link href="/admin/review" className="font-bold underline">
            Open the review queue
          </Link>
        </div>
      )}
      {stats.emailFailed > 0 && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-[#ffd3cb]" role="status">
          {stats.emailFailed} email(s) failed to send. Buyers still see their passes in their account.
        </div>
      )}

      <section aria-labelledby="people-title" className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-2xl border border-gold/25 bg-ink-2 p-6">
          <p id="people-title" className="text-sm text-muted">
            Confirmed people (tickets on confirmed bookings)
          </p>
          <p className="mt-2 font-sans text-6xl font-semibold text-ivory">{stats.confirmedPeople.toLocaleString("en-IN")}</p>
          <p className="mt-2 text-sm text-mist">
            {stats.girls.toLocaleString("en-IN")} girls · {stats.boys.toLocaleString("en-IN")} boys
          </p>
        </div>
        <div className="rounded-2xl border border-ivory/10 bg-ink-2 p-6">
          <p className="text-sm text-muted">Capacity in use (confirmed + held + in review)</p>
          {capacity != null ? (
            <>
              <p className="mt-2 font-sans text-3xl font-semibold text-ivory">
                {stats.placesInUse.toLocaleString("en-IN")}{" "}
                <span className="text-lg text-muted">of {capacity.toLocaleString("en-IN")}</span>
              </p>
              <div
                className="mt-4 h-3 overflow-hidden rounded-full bg-gold/15"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={capacity}
                aria-valuenow={stats.placesInUse}
                aria-label="Capacity in use"
              >
                <div className={`h-full rounded-full ${meterColor}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted">
                {pct}% · {demo && settings.capacity == null ? "demo capacity (not configured)" : "configured capacity"}
                {demo ? " · includes demo bookings" : ""}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-danger">
              Capacity isn’t set — live sales stay closed.{" "}
              <Link href="/admin/settings" className="underline">
                Set it in Settings
              </Link>
              .
            </p>
          )}
        </div>
      </section>

      <section aria-label="Bookings and money" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Confirmed bookings" value={stats.confirmedBookings.toLocaleString("en-IN")} note="Bookings, not tickets" />
        <Tile
          label="Tickets issued"
          value={stats.ticketsIssued.toLocaleString("en-IN")}
          note={`${stats.ticketsValid.toLocaleString("en-IN")} currently valid`}
        />
        <Tile label="Checked in" value={stats.checkedIn.toLocaleString("en-IN")} note="Tickets scanned at the door" />
        <Tile
          label="In review"
          value={stats.inReview.toLocaleString("en-IN")}
          note={`${formatINR(stats.inReviewTotalPaise)} to verify`}
        />
        <Tile label="Verified payments" value={formatINR(stats.verifiedTotalPaise)} note="Sum of confirmed bookings" />
        <Tile
          label="Awaiting payment"
          value={stats.pendingBookings.toLocaleString("en-IN")}
          note="Holding places, no proof yet"
        />
        <Tile
          label="Rejected / cancelled"
          value={`${stats.rejected} / ${stats.cancelled}`}
          note="Handle any refunds in your UPI app"
        />
        <Tile label="Emails queued" value={stats.emailPending.toLocaleString("en-IN")} note={`${stats.emailFailed} failed`} />
      </section>

      <p className="text-xs text-muted">
        “Verified payments” is what organisers approved after checking their UPI account — reconcile it against your bank
        statement.
        {stats.demoConfirmed > 0 && ` ${stats.demoConfirmed} demo booking(s) are excluded.`}
      </p>
    </div>
  );
}
