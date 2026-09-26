import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/site/wordmark";
import { CheckInConsole } from "@/components/staff/check-in-console";
import { requireRolePage } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/env";

export const metadata: Metadata = { title: "Door check-in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CheckInPage() {
  const user = await requireRolePage(["staff", "admin"], "/staff/check-in");
  const demo = isDemoMode();
  return (
    <div className="min-h-dvh bg-ink">
      <header className="border-b border-gold/15 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <Wordmark />
          <div className="flex min-w-0 items-center gap-3 text-xs text-muted">
            <span className="hidden truncate sm:inline">{user.email}</span>
            {user.role === "admin" && (
              <Link href="/admin" className="font-semibold text-gold">
                Dashboard
              </Link>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <h1 className="font-display text-4xl text-ivory">Door check-in</h1>
        <p className="mt-2 mb-6 text-sm text-muted">
          Scan, check the result, then tap <strong>Admit</strong>. Each pass admits once. Staff see first name, booking reference
          and pass number only.
          {demo && <span className="ml-1 font-semibold text-danger">Demo mode: demo passes can be checked in for testing.</span>}
        </p>
        <CheckInConsole />
      </main>
    </div>
  );
}
