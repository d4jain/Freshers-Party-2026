import Link from "next/link";
import { cn } from "@/lib/utils";

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("group inline-flex items-baseline gap-1.5 leading-none", className)}
      aria-label="Freshers’ Party 2026 — home"
    >
      <span className="font-display text-[1.35rem] font-semibold tracking-tight text-ivory">Freshers’</span>
      <span className="font-display text-[1.35rem] text-gold italic">’26</span>
      <svg
        viewBox="0 0 10 10"
        className="h-2.5 w-2.5 self-start text-gold transition-transform duration-500 group-hover:rotate-90"
        aria-hidden="true"
      >
        <path d="M5 0 Q5.6 4.4 10 5 Q5.6 5.6 5 10 Q4.4 5.6 0 5 Q4.4 4.4 5 0Z" fill="currentColor" />
      </svg>
    </Link>
  );
}
