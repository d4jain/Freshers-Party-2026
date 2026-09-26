import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Opens the group in WhatsApp. Joining is the user's own action; the site
 * cannot and does not check membership.
 */
export function WhatsAppCta({ href, className, compact = false }: { href: string; className?: string; compact?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[1.25rem] border border-gold/30 bg-[linear-gradient(135deg,rgba(215,183,119,0.12),rgba(116,69,204,0.12))] p-5 sm:p-6",
        className,
      )}
    >
      {!compact && (
        <p className="mb-4 text-sm text-mist">
          Updates and entry details are shared in the WhatsApp group. Joining happens in WhatsApp — we can’t see or confirm
          membership.
        </p>
      )}
      <a href={href} target="_blank" rel="noopener noreferrer" className="btn-gold min-h-14 w-full text-base sm:w-auto sm:px-8">
        <MessageCircle className="h-5 w-5" aria-hidden="true" />
        Join the WhatsApp group for updates and entry details
        <span className="sr-only"> (opens WhatsApp)</span>
      </a>
    </div>
  );
}
