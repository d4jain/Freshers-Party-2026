import { cn } from "@/lib/utils";

const MAP: Record<string, { label: string; className: string }> = {
  confirmed: { label: "Confirmed", className: "border-success/40 bg-success/10 text-success" },
  pending_payment: { label: "Awaiting payment proof", className: "border-gold/40 bg-gold/10 text-gold-bright" },
  expired: { label: "Expired", className: "border-ivory/20 bg-ivory/5 text-muted" },
  in_review: { label: "In review", className: "border-violet-soft/50 bg-violet/15 text-[#d9ccff]" },
  rejected: { label: "Rejected", className: "border-danger/40 bg-danger/10 text-danger" },
  cancelled: { label: "Cancelled", className: "border-danger/40 bg-danger/10 text-danger" },
};

export function StatusChip({ status, className }: { status: string; className?: string }) {
  const m = MAP[status] ?? { label: status, className: "border-ivory/20 text-mist" };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold", m.className, className)}>
      {m.label}
    </span>
  );
}
