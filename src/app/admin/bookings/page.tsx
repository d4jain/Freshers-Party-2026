import Link from "next/link";
import { StatusChip } from "@/components/account/status-chip";
import { BOOKING_STATUSES, searchBookings } from "@/lib/admin/queries";
import { getDb } from "@/lib/db";
import { formatDateTimeIST } from "@/lib/format";
import { formatINR } from "@/lib/money";

export default async function AdminBookings(props: PageProps<"/admin/bookings">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const { rows, hasMore } = await searchBookings(getDb(), { q, status, page });
  const qs = (p: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), page: String(p) })}`;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl text-ivory">Bookings</h1>
      <form className="flex flex-col gap-3 sm:flex-row" role="search">
        <label className="sr-only" htmlFor="q">
          Search
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Reference, name, email, phone, order/payment id, code"
          className="field"
        />
        <label className="sr-only" htmlFor="status">
          Status
        </label>
        <select id="status" name="status" defaultValue={status} className="field sm:w-56">
          <option value="">All statuses</option>
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
        <button className="btn-gold !min-h-12 shrink-0" type="submit">
          Search
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-ivory/10">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-ink-2 text-xs tracking-wider text-muted uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">
                Reference
              </th>
              <th scope="col" className="px-4 py-3">
                Status
              </th>
              <th scope="col" className="px-4 py-3">
                Booker
              </th>
              <th scope="col" className="px-4 py-3">
                People (G/B)
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Total
              </th>
              <th scope="col" className="px-4 py-3">
                Gateway
              </th>
              <th scope="col" className="px-4 py-3">
                Created
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ivory/5">
            {rows.map((b) => (
              <tr key={b.id} className="hover:bg-ink-2/60">
                <td className="px-4 py-3">
                  <Link href={`/admin/bookings/${b.id}`} className="font-semibold text-gold underline-offset-4 hover:underline">
                    {b.reference}
                  </Link>
                  {b.isDemo && <span className="ml-2 text-[0.65rem] font-bold text-danger">DEMO</span>}
                </td>
                <td className="px-4 py-3">
                  <StatusChip status={b.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="text-ivory">{b.bookerName}</div>
                  <div className="text-xs text-muted">
                    {b.bookerEmail} · {b.bookerPhone}
                  </div>
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {b.quantityTotal} ({b.quantityGirls}/{b.quantityBoys})
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatINR(b.totalPaise)}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted">
                  <div>{b.gatewayOrderId ?? "—"}</div>
                  <div>{b.capturedPaymentId ?? ""}</div>
                </td>
                <td className="px-4 py-3 text-xs text-muted">{formatDateTimeIST(b.createdAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  No bookings match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <nav className="flex gap-3" aria-label="Pagination">
        {page > 1 && (
          <Link className="btn-ghost !min-h-10 text-sm" href={qs(page - 1)}>
            Previous
          </Link>
        )}
        {hasMore && (
          <Link className="btn-ghost !min-h-10 text-sm" href={qs(page + 1)}>
            Next
          </Link>
        )}
      </nav>
    </div>
  );
}
