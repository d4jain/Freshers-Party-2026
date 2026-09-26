import "server-only";
import { EVENT_FACTS } from "@/config/event";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { resolvePaymentMode } from "@/lib/payments";
import { evaluateSales, fallbackSettings, getSettings, type EventSettings } from "@/lib/settings";

export type PublicEvent = {
  settings: EventSettings;
  source: "database" | "fallback";
  salesOpen: boolean;
  salesMessage: string | null;
  paymentMode: "razorpay" | "demo" | "disabled";
  mapUrl: string;
  mapIsVerifiedPin: boolean;
  directionsUrl: string;
  whatsappUrl: string;
};

/**
 * Settings for public pages. The landing page must stay usable even when the
 * database is unreachable, so this falls back to the confirmed facts.
 */
export async function getPublicEvent(): Promise<PublicEvent> {
  let settings: EventSettings;
  let source: PublicEvent["source"] = "database";
  try {
    if (!isDatabaseConfigured()) throw new Error("no db");
    settings = await getSettings(getDb());
  } catch {
    settings = fallbackSettings();
    source = "fallback";
  }
  const mode = resolvePaymentMode();
  const sales = evaluateSales(settings, mode, new Date());
  const query = encodeURIComponent(EVENT_FACTS.venueSearchQuery);
  return {
    settings,
    source,
    salesOpen: sales.open && source === "database",
    salesMessage: sales.open ? null : sales.reason,
    paymentMode: mode.kind,
    mapUrl: settings.venueMapUrl ?? `https://www.google.com/maps/search/?api=1&query=${query}`,
    mapIsVerifiedPin: Boolean(settings.venueMapUrl),
    directionsUrl: settings.venueMapUrl ?? `https://www.google.com/maps/dir/?api=1&destination=${query}`,
    whatsappUrl: settings.whatsappGroupUrl ?? EVENT_FACTS.whatsappGroupUrl,
  };
}
