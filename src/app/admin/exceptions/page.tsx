import Link from "next/link";
import { resolveException } from "@/app/admin/actions";
import { ActionForm } from "@/components/admin/action-form";
import { openExceptions } from "@/lib/admin/queries";
import { getDb } from "@/lib/db";
import { formatDateTimeIST } from "@/lib/format";

const HELP: Record<string, string> = {
  capacity_unavailable_after_capture:
    "Paid after the hold lapsed and no places were left. Free up capacity and retry confirmation, or refund in Razorpay.",
  amount_mismatch: "Captured amount/currency differs from the booking. Investigate and refund in Razorpay.",
  extra_capture: "A second payment was captured for an already-confirmed booking. Refund the extra payment in Razorpay.",
  partial_refund: "A partial refund was made. Void the matching pass(es) on the booking.",
  coupon_over_limit: "A late payment used a coupon beyond its limit. The paid price was honoured; review if needed.",
  capture_on_refunded_booking: "A payment was captured on a refunded booking. Refund it in Razorpay.",
  unknown_order: "A captured payment references an order this site didn’t create. Check the Razorpay Dashboard.",
};

export default async function ExceptionsPage(props: PageProps<"/admin/exceptions">) {
  const sp = await props.searchParams;
  const all = sp.all === "1";
  const rows = await openExceptions(getDb(), all);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-4xl text-ivory">Exceptions & reconciliation</h1>
        <Link className="text-sm font-semibold text-gold" href={all ? "/admin/exceptions" : "/admin/exceptions?all=1"}>
          {all ? "Show open only" : "Show resolved too"}
        </Link>
      </div>
      <p className="max-w-3xl text-sm text-muted">
        Every paid-but-unconfirmed, duplicate or mismatched payment lands here. Paid orders are never silently discarded. Resolve
        in Razorpay first, then record what you did.
      </p>
      {rows.length === 0 && <p className="card p-6 text-mist">Nothing needs attention.</p>}
      <ul className="space-y-4">
        {rows.map(({ e, reference, bookerName, status }) => (
          <li key={e.id} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-ivory">{e.kind.replaceAll("_", " ")}</p>
              <p className="text-xs text-muted">{formatDateTimeIST(e.createdAt)}</p>
            </div>
            <p className="mt-1 text-sm text-mist">{HELP[e.kind]}</p>
            {e.bookingId && (
              <p className="mt-2 text-sm">
                <Link className="font-semibold text-gold underline" href={`/admin/bookings/${e.bookingId}`}>
                  {reference}
                </Link>{" "}
                · {bookerName} · {status}
              </p>
            )}
            <p className="mt-1 font-mono text-xs break-all text-muted">{JSON.stringify(e.details)}</p>
            {e.resolvedAt ? (
              <p className="mt-3 text-sm text-success">
                Resolved {formatDateTimeIST(e.resolvedAt)} — {e.resolutionNote}
              </p>
            ) : (
              <ActionForm
                action={resolveException}
                submitLabel="Mark resolved"
                className="mt-4 space-y-2"
                submitClassName="btn-ghost !min-h-10 text-sm"
              >
                <input type="hidden" name="id" value={e.id} />
                <label className="field-label" htmlFor={`n-${e.id}`}>
                  Resolution note
                </label>
                <input
                  id={`n-${e.id}`}
                  name="note"
                  required
                  minLength={5}
                  className="field"
                  placeholder="e.g. Refunded pay_XXXX in Razorpay on 2 Oct"
                />
              </ActionForm>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
