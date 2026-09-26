import { AtSign, Mail, MessageCircle, Phone } from "lucide-react";
import type { PublicEvent } from "@/lib/public-settings";

function waLink(phone: string) {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

function instagramUrl(handle: string) {
  if (/^https?:\/\//.test(handle)) return handle;
  return `https://instagram.com/${handle.replace(/^@/, "")}`;
}

/** Contact buttons appear only for details the organiser has configured. */
export function ReachOut({ event }: { event: PublicEvent }) {
  const s = event.settings;
  const contacts = [
    s.organiserPhone && { href: `tel:${s.organiserPhone}`, label: "Call the organiser", value: s.organiserPhone, icon: Phone },
    s.organiserWhatsapp && {
      href: waLink(s.organiserWhatsapp),
      label: "WhatsApp the organiser",
      value: s.organiserWhatsapp,
      icon: MessageCircle,
      external: true,
    },
    s.organiserEmail && { href: `mailto:${s.organiserEmail}`, label: "Email", value: s.organiserEmail, icon: Mail },
    s.organiserInstagram && {
      href: instagramUrl(s.organiserInstagram),
      label: "Instagram",
      value: s.organiserInstagram,
      icon: AtSign,
      external: true,
    },
  ].filter(Boolean) as { href: string; label: string; value: string; icon: typeof Phone; external?: boolean }[];

  return (
    <div className="invite-frame relative overflow-hidden px-6 py-12 text-center sm:px-12 sm:py-16">
      <div className="bg-scatter pointer-events-none absolute inset-0 bg-cover opacity-60" aria-hidden="true" />
      <p className="eyebrow relative">Reach out</p>
      <h2 id="reach-title" className="display relative mt-4 text-[clamp(2.6rem,9vw,5rem)] text-ivory">
        Questions? <em className="text-gold">Ask away.</em>
      </h2>
      {s.organiserName ? (
        <p className="relative mt-4 text-mist">Organised by {s.organiserName}.</p>
      ) : (
        <p className="relative mt-4 text-mist">
          Organiser contact details are coming soon. Updates land in the WhatsApp group first.
        </p>
      )}

      <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
        <a href={event.whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-gold min-h-14 px-8">
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
          Join the WhatsApp group
          <span className="sr-only"> (opens WhatsApp)</span>
        </a>
        {contacts.map((c) => (
          <a
            key={c.label}
            href={c.href}
            {...(c.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="btn-ghost min-h-14"
          >
            <c.icon className="h-4 w-4" aria-hidden="true" />
            {c.label}
            <span className="sr-only">: {c.value}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
