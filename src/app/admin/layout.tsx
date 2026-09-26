import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/site/wordmark";
import { requireRolePage } from "@/lib/auth/session";
import { resolvePaymentMode } from "@/lib/payments";

export const metadata: Metadata = { title: "Organiser dashboard", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const NAV = [
  ["/admin", "Overview"],
  ["/admin/bookings", "Bookings"],
  ["/admin/exceptions", "Exceptions"],
  ["/admin/coupons", "Coupons"],
  ["/admin/referrals", "Referrals"],
  ["/admin/settings", "Settings"],
  ["/admin/audit", "Audit"],
  ["/staff/check-in", "Check-in"],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRolePage(["admin"], "/admin");
  const mode = resolvePaymentMode();
  return (
    <div className="min-h-dvh bg-ink" data-no-glitter>
      <header className="sticky top-0 z-40 border-b border-gold/15 bg-ink/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <Wordmark />
            <span className="rounded-full border border-gold/30 px-2.5 py-0.5 text-xs font-bold text-gold">Organiser</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${mode.kind === "razorpay" && mode.keyMode === "live" ? "bg-danger/20 text-danger" : mode.kind === "demo" ? "border border-dashed border-danger/60 text-danger" : "bg-ivory/10 text-mist"}`}
            >
              {mode.kind === "razorpay"
                ? `Razorpay ${mode.keyMode.toUpperCase()}`
                : mode.kind === "demo"
                  ? "DEMO MODE"
                  : "Payments off"}
            </span>
          </div>
          <p className="hidden truncate text-xs text-muted sm:block">Signed in as {user.email}</p>
        </div>
        <nav aria-label="Organiser" className="mx-auto max-w-7xl overflow-x-auto px-4 sm:px-6">
          <ul className="flex gap-1 pb-2 text-sm font-semibold">
            {NAV.map(([href, label]) => (
              <li key={href}>
                <Link
                  href={href}
                  className="block rounded-full px-3 py-1.5 whitespace-nowrap text-mist hover:bg-gold/10 hover:text-gold-bright"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
