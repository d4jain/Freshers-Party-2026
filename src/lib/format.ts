import { EVENT_TIMEZONE } from "@/config/event";

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: EVENT_TIMEZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: EVENT_TIMEZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: EVENT_TIMEZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "Thursday, 1 October 2026" for a YYYY-MM-DD calendar date in IST. */
export function formatEventDate(isoDate: string): string {
  return dateFmt.format(new Date(`${isoDate}T12:00:00+05:30`));
}

export function formatTimeIST(d: Date): string {
  return `${timeFmt.format(d).toLowerCase()} IST`;
}

export function formatDateTimeIST(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return `${dateTimeFmt.format(new Date(d))} IST`;
}

/** Human timing line. Never invents a time: shows "Timing to be announced" until configured. */
export function eventTimingLabel(startsAt: Date | null, endsAt: Date | null): string {
  if (!startsAt) return "Timing to be announced";
  return endsAt ? `${formatTimeIST(startsAt)} – ${formatTimeIST(endsAt)}` : `From ${formatTimeIST(startsAt)}`;
}

/** Converts an IST wall-clock string ("2026-10-01T19:00") to a UTC Date. */
export function istLocalToDate(local: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const d = new Date(`${local}:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Converts a Date to an IST wall-clock string for <input type="datetime-local">. */
export function dateToIstLocal(d: Date | null | undefined): string {
  if (!d) return "";
  const ist = new Date(d.getTime() + 330 * 60_000);
  return ist.toISOString().slice(0, 16);
}
