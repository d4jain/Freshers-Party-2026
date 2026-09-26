"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="display mt-3 text-5xl text-ivory">The music skipped.</h1>
      <p className="mt-4 text-mist">Please try again. If you were paying, don’t pay twice — check My bookings first.</p>
      <div className="mt-8 flex gap-3">
        <button type="button" className="btn-gold" onClick={reset}>
          Try again
        </button>
        <Link href="/account" className="btn-ghost">
          My bookings
        </Link>
      </div>
    </main>
  );
}
