"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import { Wordmark } from "./wordmark";

const LINKS = [
  { href: "/#experience", label: "The Experience" },
  { href: "/#menu", label: "Menu" },
  { href: "/#venue", label: "Venue" },
  { href: "/#faq", label: "FAQ" },
];

function AccountLink({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const { data, isPending } = authClient.useSession();
  const signedIn = Boolean(data?.user);
  return (
    <Link
      href={signedIn ? "/account" : "/login"}
      onClick={onNavigate}
      className={cn("transition-colors hover:text-gold-bright", isPending && "opacity-70", className)}
    >
      {signedIn ? "My account" : "Log in"}
    </Link>
  );
}

export function SiteNav({ solid = false }: { solid?: boolean }) {
  const [scrolled, setScrolled] = useState(solid);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (solid) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [solid]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background,border-color,backdrop-filter] duration-500",
        scrolled ? "border-b border-gold/15 bg-ink/80 backdrop-blur-xl" : "border-b border-transparent bg-transparent",
      )}
    >
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-20 lg:px-8"
      >
        <Wordmark />

        <div className="hidden items-center gap-8 text-sm font-semibold text-mist lg:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="transition-colors hover:text-gold-bright">
              {l.label}
            </Link>
          ))}
          <AccountLink />
          <Link href="/book" className="btn-gold !min-h-11 !px-5 text-sm">
            Book Your Spot
          </Link>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <Link href="/book" className="btn-gold !min-h-10 !px-4 text-sm">
            Book
          </Link>
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-gold/30 text-ivory"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="data-[state=open]:animate-in fixed inset-0 z-[60] bg-ink/70 backdrop-blur-sm" />
              <Dialog.Content
                className="fixed inset-x-0 top-0 z-[61] rounded-b-3xl border-b border-gold/25 bg-ink-2 px-6 pt-5 pb-8 shadow-2xl"
                data-no-glitter
              >
                <div className="flex items-center justify-between">
                  <Dialog.Title className="sr-only">Menu</Dialog.Title>
                  <Wordmark />
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-gold/30"
                      aria-label="Close menu"
                    >
                      <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </Dialog.Close>
                </div>
                <Dialog.Description className="sr-only">Site navigation</Dialog.Description>
                <ul className="mt-8 space-y-1 font-display text-3xl">
                  {LINKS.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} onClick={() => setOpen(false)} className="block py-2 text-ivory hover:text-gold">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <AccountLink className="block py-2 text-ivory" onNavigate={() => setOpen(false)} />
                  </li>
                </ul>
                <Link href="/book" onClick={() => setOpen(false)} className="btn-gold mt-8 w-full">
                  Book Your Spot
                </Link>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </nav>
    </header>
  );
}
