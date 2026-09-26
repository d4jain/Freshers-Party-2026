import { EVENT_FACTS } from "@/config/event";
import type { Booking } from "@/lib/db/schema";
import { eventTimingLabel, formatEventDate } from "@/lib/format";
import { formatINR } from "@/lib/money";
import type { EventSettings } from "@/lib/settings";
import type { EmailMessage } from "./provider";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#09070D;font-family:Arial,Helvetica,sans-serif;color:#F7F0E6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;border:1px solid #6b5a3a;border-radius:16px;background:#120e19">
<tr><td style="padding:28px 28px 8px"><div style="font-family:Georgia,serif;font-size:13px;letter-spacing:3px;color:#D7B777;text-transform:uppercase">${esc(EVENT_FACTS.name)}</div>
<h1 style="font-family:Georgia,serif;font-weight:normal;font-size:28px;margin:12px 0 0;color:#F7F0E6">${esc(title)}</h1></td></tr>
<tr><td style="padding:8px 28px 28px;font-size:15px;line-height:1.6;color:#e9e1d4">${bodyHtml}</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #2a2233;font-size:12px;color:#a89f92">${esc(EVENT_FACTS.independentDisclosure)}</td></tr>
</table></td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<a href="${esc(href)}" style="display:inline-block;background:#D7B777;color:#09070D;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:999px;margin:8px 8px 0 0">${esc(label)}</a>`;

export function bookingConfirmationEmail(opts: {
  booking: Booking;
  settings: EventSettings;
  appUrl: string;
}): Omit<EmailMessage, "to"> {
  const { booking, settings, appUrl } = opts;
  const passesUrl = `${appUrl}/account/bookings/${booking.id}`;
  const whatsapp = settings.whatsappGroupUrl ?? EVENT_FACTS.whatsappGroupUrl;
  const date = formatEventDate(settings.eventDate);
  const timing = eventTimingLabel(settings.startsAt, settings.endsAt);
  const venue = `${settings.venueName}, ${settings.venueBranch}`;
  const passes = `${booking.quantityTotal} pass${booking.quantityTotal === 1 ? "" : "es"}`;
  const demo = booking.isDemo ? "DEMO BOOKING — no real payment was taken and these passes are not valid for entry. " : "";

  const text = [
    `${demo}You’re on the guest list!`,
    ``,
    `Booking reference: ${booking.reference}`,
    `${passes} · ${booking.quantityGirls} girls, ${booking.quantityBoys} boys`,
    `Amount paid: ${formatINR(booking.totalPaise)}`,
    `Date: ${date}`,
    `Time: ${timing}`,
    `Venue: ${venue}`,
    ``,
    `View and download your passes (log in required): ${passesUrl}`,
    `Join the WhatsApp group for updates and entry details: ${whatsapp}`,
    ``,
    `Every person in this booking must be a first-year Bennett University student.`,
    EVENT_FACTS.independentDisclosure,
  ].join("\n");

  const html = layout(
    booking.isDemo ? "Demo booking confirmed" : "You’re on the guest list",
    `${demo ? `<p style="color:#ffb4a8"><strong>${esc(demo)}</strong></p>` : ""}
<p>Your booking is confirmed. See you on the dance floor.</p>
<table role="presentation" style="width:100%;font-size:14px;margin:12px 0">
<tr><td style="color:#a89f92;padding:4px 0">Reference</td><td style="text-align:right;font-weight:bold">${esc(booking.reference)}</td></tr>
<tr><td style="color:#a89f92;padding:4px 0">Passes</td><td style="text-align:right">${esc(passes)} (${booking.quantityGirls} girls, ${booking.quantityBoys} boys)</td></tr>
<tr><td style="color:#a89f92;padding:4px 0">Amount paid</td><td style="text-align:right">${esc(formatINR(booking.totalPaise))}</td></tr>
<tr><td style="color:#a89f92;padding:4px 0">Date</td><td style="text-align:right">${esc(date)}</td></tr>
<tr><td style="color:#a89f92;padding:4px 0">Time</td><td style="text-align:right">${esc(timing)}</td></tr>
<tr><td style="color:#a89f92;padding:4px 0">Venue</td><td style="text-align:right">${esc(venue)}</td></tr>
</table>
${button(passesUrl, "View my passes")}${button(whatsapp, "Join the WhatsApp group")}
<p style="font-size:13px;color:#a89f92;margin-top:20px">Joining the WhatsApp group is how you’ll get updates and entry details. Every person in this booking must be a first-year Bennett University student.</p>`,
  );

  return {
    subject: `${booking.isDemo ? "[DEMO] " : ""}You’re in — ${EVENT_FACTS.name} (${booking.reference})`,
    html,
    text,
  };
}

export function verificationEmail(url: string): Omit<EmailMessage, "to"> {
  return {
    subject: `Verify your email — ${EVENT_FACTS.name}`,
    text: `Confirm your email address to book your spot:\n${url}\n\nIf you didn’t create an account, ignore this email.`,
    html: layout(
      "Verify your email",
      `<p>Confirm your email address to book your spot.</p>${button(url, "Verify email")}<p style="font-size:13px;color:#a89f92;margin-top:16px">If you didn’t create an account, you can ignore this email.</p>`,
    ),
  };
}

export function passwordResetEmail(url: string): Omit<EmailMessage, "to"> {
  return {
    subject: `Reset your password — ${EVENT_FACTS.name}`,
    text: `Reset your password (link expires in 1 hour):\n${url}\n\nIf you didn’t ask for this, ignore this email.`,
    html: layout(
      "Reset your password",
      `<p>Use the button below to choose a new password. The link expires in 1 hour.</p>${button(url, "Reset password")}<p style="font-size:13px;color:#a89f92;margin-top:16px">If you didn’t ask for this, you can ignore this email.</p>`,
    ),
  };
}
