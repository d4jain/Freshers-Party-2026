/**
 * Confirmed event facts and seed defaults.
 *
 * At runtime the `event_settings` database row is the single authoritative
 * source for anything organisers can change (price, capacity, timing,
 * contacts, policies, media). These values only seed that row and act as a
 * read-only fallback for the public landing page when the database is
 * unreachable. Booking and payment code never reads prices from here.
 *
 * Never add unconfirmed facts (start time, capacity, contacts, refund rules,
 * drink inclusions, map pin). Leave them null and configure them in
 * Admin → Settings once the organiser confirms them.
 */

export const EVENT_TIMEZONE = "Asia/Kolkata";

export const EVENT_FACTS = {
  name: "Freshers’ Party 2026",
  shortName: "Freshers’ 2026",
  /** Calendar date in Asia/Kolkata. The start time is not confirmed. */
  eventDate: "2026-10-01",
  timezone: EVENT_TIMEZONE,
  venueName: "Rubarru",
  venueBranch: "Advant Navis Park, Noida",
  /**
   * As listed on https://rubarru.com/contact/ (checked 26 Sep 2026). The
   * postcode is omitted because the site lists two different values.
   */
  venueAddress:
    "Unit 106, 1st Floor, Tower D, Uptown Square, Advant Navis Business Park, Noida–Greater Noida Expressway, Sector 142, Noida, Uttar Pradesh",
  venueWebsite: "https://rubarru.com/",
  /** Search link used until an exact map pin is verified by the organiser. */
  venueSearchQuery: "Rubarru, Uptown Square, Advant Navis Business Park, Sector 142, Noida",
  whatsappGroupUrl: "https://chat.whatsapp.com/FmJaepiArmjAbe7v5fofZA?mode=gi_t",
  highlights: ["Unlimited Food + Unlimited Drinks", "Party | Dance | Games"],
  audience: "First-year Bennett University students only",
  independentDisclosure:
    "Freshers’ Party 2026 is an unofficial, independently organised event. It is not organised, endorsed or sponsored by Bennett University.",
} as const;

/**
 * Organiser's UPI payment details, decoded from the supplied QR code
 * (public/media/payment/upi-qr.png). Editable in Admin → Settings.
 */
export const UPI_DEFAULTS = {
  upiId: "63968583011@axl",
  payeeName: "ABHIRAKSHIT GAUR",
  qrPath: "/media/payment/upi-qr.png",
};

/** Prices are integer paise. ₹2,199 = 219900 paise. */
export const PRICING_DEFAULTS = {
  currency: "INR" as const,
  unitPricePaise: 219_900,
  compareAtPricePaise: 250_000,
  /** No customer surcharge by default. */
  bookingFeePaise: 0,
};

/**
 * Development default for the maximum places in one booking. Organisers can
 * change it in Admin → Settings.
 */
export const DEFAULT_MAX_GROUP_SIZE = 10;

/** How long a new booking holds its places while the buyer pays and uploads proof (server time). */
export const DEFAULT_HOLD_MINUTES = 30;

/** Capacity used only in clearly labelled demo mode when none is configured. */
export const DEMO_CAPACITY = 150;

/** Version strings stored with every booking acknowledgement. */
export const ELIGIBILITY_ACK_VERSION = "eligibility-v1";
export const ELIGIBILITY_ACK_TEXT =
  "I confirm that every person included in this booking is a first-year student at Bennett University.";

/** Fallback countdown target when no start time is configured: 1 Oct 2026, 00:00 IST. */
export const EVENT_DAY_START_ISO = "2026-10-01T00:00:00+05:30";
/** End of the event day in IST, used for "ended" copy when no end time is configured. */
export const EVENT_DAY_END_ISO = "2026-10-02T00:00:00+05:30";
