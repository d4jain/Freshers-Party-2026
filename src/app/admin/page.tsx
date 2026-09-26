import Link from "next/link";
import { overviewStats } from "@/lib/admin/queries";
import { getDb } from "@/lib/db";
import { formatDateTimeIST } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { effectiveCapacity, getSettings } from "@/lib/settings";
import { resolvePaymentMode } from "@/lib/payments";

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
  const mode = resolvePaymentMode();
  const capacity = effectiveCapacity(settings, mode.kind === "demo");
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

      {(stats.openExceptions > 0 || stats.needsReview > 0 || stats.emailFailed > 0) && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-[#ffd3cb]" role="status">
          <strong>Needs attention:</strong> {stats.openExceptions} open exception(s), {stats.needsReview} booking(s) under review,{" "}
          {stats.emailFailed} failed email(s).{" "}
          <Link href="/admin/exceptions" className="font-bold underline">
            Open the exception queue
          </Link>
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
          <p className="text-sm text-muted">Capacity in use (confirmed + live holds)</p>
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
                {pct}% ·{" "}
                {mode.kind === "demo" && settings.capacity == null ? "demo capacity (not configured)" : "configured capacity"}
                {mode.kind === "demo" ? " · includes demo bookings" : ""}
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
        <Tile label="Awaiting payment" value={stats.pendingBookings.toLocaleString("en-IN")} note="Pending bookings with holds" />
        <Tile
          label="Gross captured"
          value={formatINR(stats.grossCapturedPaise)}
          note={`${stats.captures} captured payment(s) — not bank settlements`}
        />
        <Tile label="Refunded" value={formatINR(stats.refundedPaise)} note="Synced from Razorpay" />
        <Tile label="Under review" value={stats.needsReview.toLocaleString("en-IN")} note="Paid but not auto-confirmed" />
        <Tile label="Emails queued" value={stats.emailPending.toLocaleString("en-IN")} note={`${stats.emailFailed} failed`} />
      </section>

      <p className="text-xs text-muted">
        Gross captured is the sum of captured Razorpay payments, including any extra captures awaiting refund. Settlements to the
        bank account arrive separately and net of Razorpay fees — check the Razorpay Dashboard.
        {stats.demoConfirmed > 0 && ` ${stats.demoConfirmed} demo booking(s) are excluded.`}
      </p>
    </div>
  );
}
