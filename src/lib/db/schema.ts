import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  customType,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * All timestamps are `timestamptz` and stored in UTC. Event times are
 * displayed in Asia/Kolkata by the UI layer. All money is integer paise.
 */
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
/** Raw binary (Postgres bytea) — used for payment-proof images. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ------------------------------------------------------------------ */
/* Auth tables (Better Auth core schema + additional user fields)      */
/* ------------------------------------------------------------------ */

export const userRole = pgEnum("user_role", ["user", "staff", "admin"]);

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** E.164, e.g. +919876543210 */
    phone: text("phone").notNull(),
    /** Assigned only by the server-side provisioning command. */
    role: userRole("role").notNull().default("user"),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    /** Normalised referral code entered at signup (attribution only). */
    signupReferralCode: text("signup_referral_code"),
    signupReferralCodeId: uuid("signup_referral_code_id").references((): AnyPgColumn => referralCodes.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("user_role_idx").on(t.role)],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/** Better Auth's database rate-limit store (shared across serverless instances). */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* ------------------------------------------------------------------ */
/* Event settings — single authoritative row (id = 'main')             */
/* ------------------------------------------------------------------ */

export type ApprovedMedia = {
  id: string;
  kind: "venue" | "previous_event" | "mood";
  type: "image" | "video";
  src: string;
  poster?: string;
  alt: string;
  caption: string;
  credit?: string;
};

export const eventSettings = pgTable(
  "event_settings",
  {
    id: text("id").primaryKey().default("main"),
    eventName: text("event_name").notNull(),
    eventDate: date("event_date").notNull(),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    /** Null until the organiser confirms a start time. */
    startsAt: ts("starts_at"),
    endsAt: ts("ends_at"),
    venueName: text("venue_name").notNull(),
    venueBranch: text("venue_branch").notNull(),
    venueAddress: text("venue_address"),
    venueWebsite: text("venue_website"),
    /** Verified map pin URL. Until set, a labelled search link is shown. */
    venueMapUrl: text("venue_map_url"),
    currency: text("currency").notNull().default("INR"),
    unitPricePaise: integer("unit_price_paise").notNull(),
    compareAtPricePaise: integer("compare_at_price_paise"),
    bookingFeePaise: integer("booking_fee_paise").notNull().default(0),
    bookingFeeLabel: text("booking_fee_label"),
    capacity: integer("capacity"),
    maxGroupSize: integer("max_group_size").notNull().default(10),
    /** Minutes a new booking keeps its places while the buyer pays and uploads proof. */
    holdMinutes: integer("hold_minutes").notNull().default(30),
    salesOpenAt: ts("sales_open_at"),
    salesCloseAt: ts("sales_close_at"),
    offerExpiresAt: ts("offer_expires_at"),
    /** Organiser switch; live checkout also requires capacity and approved policies. */
    salesEnabled: boolean("sales_enabled").notNull().default(false),
    organiserName: text("organiser_name"),
    organiserPhone: text("organiser_phone"),
    organiserWhatsapp: text("organiser_whatsapp"),
    organiserEmail: text("organiser_email"),
    organiserInstagram: text("organiser_instagram"),
    whatsappGroupUrl: text("whatsapp_group_url"),
    /** UPI payment details shown at checkout (from the organiser's QR). */
    upiId: text("upi_id"),
    upiPayeeName: text("upi_payee_name"),
    paymentQrPath: text("payment_qr_path"),
    drinksDetails: text("drinks_details"),
    termsText: text("terms_text"),
    refundPolicyText: text("refund_policy_text"),
    /** Bumped when policy text changes; stored on each booking acknowledgement. */
    policyVersion: integer("policy_version").notNull().default(1),
    policiesApproved: boolean("policies_approved").notNull().default(false),
    approvedMedia: jsonb("approved_media").$type<ApprovedMedia[]>().notNull().default([]),
    heroVideo: jsonb("hero_video").$type<{ mp4?: string; webm?: string; poster?: string } | null>(),
    version: integer("version").notNull().default(1),
    updatedBy: text("updated_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("event_settings_singleton", sql`${t.id} = 'main'`),
    check("event_settings_price_positive", sql`${t.unitPricePaise} > 0`),
    check("event_settings_fee_nonneg", sql`${t.bookingFeePaise} >= 0`),
    check("event_settings_capacity_nonneg", sql`${t.capacity} IS NULL OR ${t.capacity} >= 0`),
    check("event_settings_group_positive", sql`${t.maxGroupSize} >= 1`),
    check("event_settings_hold_positive", sql`${t.holdMinutes} BETWEEN 5 AND 180`),
  ],
);

/* ------------------------------------------------------------------ */
/* Referral codes (attribution only — never a discount)                */
/* ------------------------------------------------------------------ */

export const referralOwnerType = pgEnum("referral_owner_type", ["organiser", "campaign", "user"]);

export const referralCodes = pgTable(
  "referral_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Normalised: uppercase A–Z, 0–9 and hyphen, 3–24 chars. */
    code: text("code").notNull().unique(),
    label: text("label").notNull(),
    ownerType: referralOwnerType("owner_type").notNull(),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("referral_code_format", sql`${t.code} ~ '^[A-Z0-9-]{3,24}$'`)],
);

/* ------------------------------------------------------------------ */
/* Coupons (discounts)                                                  */
/* ------------------------------------------------------------------ */

export const discountType = pgEnum("discount_type", ["fixed", "percent"]);

export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    description: text("description"),
    discountType: discountType("discount_type").notNull(),
    /** For `fixed`: paise off the subtotal. */
    amountOffPaise: integer("amount_off_paise"),
    /** For `percent`: whole percent 1–90. */
    percentOff: integer("percent_off"),
    maxDiscountPaise: integer("max_discount_paise"),
    active: boolean("active").notNull().default(true),
    startsAt: ts("starts_at"),
    expiresAt: ts("expires_at"),
    minQuantity: integer("min_quantity"),
    minSubtotalPaise: integer("min_subtotal_paise"),
    /** Total uses across all users (held + committed). Null = unlimited. */
    maxRedemptions: integer("max_redemptions"),
    /** Uses per user (held + committed). Null = unlimited. */
    perUserLimit: integer("per_user_limit").default(1),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("coupon_code_format", sql`${t.code} ~ '^[A-Z0-9-]{3,24}$'`),
    check(
      "coupon_value_shape",
      sql`(${t.discountType} = 'fixed' AND ${t.amountOffPaise} > 0 AND ${t.percentOff} IS NULL)
       OR (${t.discountType} = 'percent' AND ${t.percentOff} BETWEEN 1 AND 90 AND ${t.amountOffPaise} IS NULL)`,
    ),
    check("coupon_limits_nonneg", sql`coalesce(${t.maxRedemptions}, 1) >= 1 AND coalesce(${t.perUserLimit}, 1) >= 1`),
    check("coupon_mins_nonneg", sql`coalesce(${t.minQuantity}, 1) >= 1 AND coalesce(${t.minSubtotalPaise}, 0) >= 0`),
    check("coupon_max_discount_nonneg", sql`coalesce(${t.maxDiscountPaise}, 1) > 0`),
  ],
);

/* ------------------------------------------------------------------ */
/* Bookings                                                             */
/* ------------------------------------------------------------------ */

/**
 * Booking states — see docs/PAYMENTS.md for the transition table.
 *   pending_payment → in_review (proof uploaded) | expired (hold lapsed, no proof)
 *   in_review       → confirmed (organiser approves) | rejected (organiser rejects)
 *   confirmed       → cancelled (organiser cancels, e.g. after a manual refund)
 * Only an organiser approval confirms a booking and issues passes.
 */
export const bookingStatus = pgEnum("booking_status", [
  "pending_payment",
  "in_review",
  "confirmed",
  "rejected",
  "expired",
  "cancelled",
]);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: text("reference").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: bookingStatus("status").notNull().default("pending_payment"),
    /** Client-generated key per checkout intent; makes creation idempotent. */
    idempotencyKey: text("idempotency_key").notNull(),
    /** Hash of the priced request, used to decide whether a pending booking can be reused. */
    requestFingerprint: text("request_fingerprint").notNull(),

    quantityTotal: integer("quantity_total").notNull(),
    quantityGirls: integer("quantity_girls").notNull(),
    quantityBoys: integer("quantity_boys").notNull(),

    currency: text("currency").notNull().default("INR"),
    unitPricePaise: integer("unit_price_paise").notNull(),
    compareAtPricePaise: integer("compare_at_price_paise"),
    subtotalPaise: integer("subtotal_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    feesPaise: integer("fees_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull(),
    /** Immutable, complete pricing breakdown at the time of booking. */
    pricingSnapshot: jsonb("pricing_snapshot").notNull(),
    settingsVersion: integer("settings_version").notNull(),

    couponId: uuid("coupon_id").references(() => coupons.id, { onDelete: "restrict" }),
    couponCode: text("coupon_code"),
    referralCodeId: uuid("referral_code_id").references(() => referralCodes.id, { onDelete: "restrict" }),
    referralCode: text("referral_code"),
    referralSource: text("referral_source"),

    bookerName: text("booker_name").notNull(),
    bookerPhone: text("booker_phone").notNull(),
    bookerEmail: text("booker_email").notNull(),

    eligibilityAckAt: ts("eligibility_ack_at").notNull(),
    eligibilityAckVersion: text("eligibility_ack_version").notNull(),
    eligibilityAckText: text("eligibility_ack_text").notNull(),
    termsAckAt: ts("terms_ack_at").notNull(),
    termsAckPolicyVersion: integer("terms_ack_policy_version").notNull(),

    isDemo: boolean("is_demo").notNull().default(false),
    paymentSubmittedAt: ts("payment_submitted_at"),
    reviewedAt: ts("reviewed_at"),
    reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
    /** Organiser's note on approval, or the reason shown to the buyer on rejection/cancellation. */
    reviewNote: text("review_note"),

    holdExpiresAt: ts("hold_expires_at").notNull(),
    confirmedAt: ts("confirmed_at"),
    expiredAt: ts("expired_at"),
    cancelledAt: ts("cancelled_at"),
    statusReason: text("status_reason"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("bookings_user_idempotency_uq").on(t.userId, t.idempotencyKey),
    /** At most one pending booking per user; a new request supersedes the old one. */
    uniqueIndex("bookings_one_pending_per_user_uq")
      .on(t.userId)
      .where(sql`${t.status} = 'pending_payment'`),
    index("bookings_status_idx").on(t.status),
    index("bookings_created_idx").on(t.createdAt),
    index("bookings_coupon_idx").on(t.couponId),
    index("bookings_referral_idx").on(t.referralCodeId),
    check("bookings_qty_positive", sql`${t.quantityTotal} >= 1`),
    check("bookings_qty_nonneg", sql`${t.quantityGirls} >= 0 AND ${t.quantityBoys} >= 0`),
    check("bookings_qty_sum", sql`${t.quantityGirls} + ${t.quantityBoys} = ${t.quantityTotal}`),
    check(
      "bookings_amounts_nonneg",
      sql`${t.unitPricePaise} > 0 AND ${t.subtotalPaise} >= 0 AND ${t.discountPaise} >= 0 AND ${t.feesPaise} >= 0`,
    ),
    check("bookings_total_positive", sql`${t.totalPaise} >= 100`),
    check(
      "bookings_total_math",
      sql`${t.subtotalPaise} = ${t.unitPricePaise} * ${t.quantityTotal} AND ${t.totalPaise} = ${t.subtotalPaise} - ${t.discountPaise} + ${t.feesPaise}`,
    ),
    check("bookings_currency_inr", sql`${t.currency} = 'INR'`),
  ],
);

export const bookingEvents = pgTable(
  "booking_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    source: text("source").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("booking_events_booking_idx").on(t.bookingId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Inventory holds                                                      */
/* ------------------------------------------------------------------ */

export const holdStatus = pgEnum("hold_status", ["active", "consumed", "released"]);

/**
 * A hold counts against capacity only while `status = 'active'` AND
 * `expires_at > now()` (database time). Capacity is always computed from
 * confirmed bookings + live holds under a lock, so a hold can never be
 * "released twice".
 */
export const inventoryHolds = pgTable(
  "inventory_holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    status: holdStatus("status").notNull().default("active"),
    expiresAt: ts("expires_at").notNull(),
    consumedAt: ts("consumed_at"),
    releasedAt: ts("released_at"),
    releaseReason: text("release_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("inventory_holds_active_idx").on(t.status, t.expiresAt),
    check("inventory_holds_qty_positive", sql`${t.quantity} >= 1`),
  ],
);

/* ------------------------------------------------------------------ */
/* Coupon reservations                                                  */
/* ------------------------------------------------------------------ */

export const couponReservationStatus = pgEnum("coupon_reservation_status", ["held", "committed", "released"]);

export const couponReservations = pgTable(
  "coupon_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "restrict" }),
    bookingId: uuid("booking_id")
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: couponReservationStatus("status").notNull().default("held"),
    expiresAt: ts("expires_at").notNull(),
    committedAt: ts("committed_at"),
    releasedAt: ts("released_at"),
    overLimit: boolean("over_limit").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("coupon_reservations_coupon_idx").on(t.couponId, t.status),
    index("coupon_reservations_user_idx").on(t.couponId, t.userId, t.status),
  ],
);

/* ------------------------------------------------------------------ */
/* Payment proofs (UPI screenshot + transaction id, one per booking)    */
/* ------------------------------------------------------------------ */

export const paymentProofs = pgTable(
  "payment_proofs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    /** UPI transaction / UTR reference, normalised to uppercase. */
    utr: text("utr").notNull(),
    payerName: text("payer_name"),
    /** Amount the buyer was asked to pay (the booking total at submission). */
    amountPaise: integer("amount_paise").notNull(),
    /** Re-encoded JPEG (metadata stripped). */
    image: bytea("image").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** SHA-256 of the uploaded bytes, to spot the same screenshot reused. */
    sha256: text("sha256").notNull(),
    submittedAt: ts("submitted_at").notNull().defaultNow(),
  },
  (t) => [
    index("payment_proofs_utr_idx").on(t.utr),
    index("payment_proofs_sha_idx").on(t.sha256),
    check("payment_proofs_amount_positive", sql`${t.amountPaise} > 0`),
    check("payment_proofs_utr_format", sql`${t.utr} ~ '^[A-Z0-9]{6,35}$'`),
  ],
);

/* ------------------------------------------------------------------ */
/* Tickets and check-ins                                                */
/* ------------------------------------------------------------------ */

export const ticketStatus = pgEnum("ticket_status", ["valid", "void"]);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    /** 1..quantity_total */
    ticketIndex: integer("ticket_index").notNull(),
    /** Random opaque identifier embedded in the QR (paired with an HMAC signature). */
    publicId: text("public_id").notNull().unique(),
    /** Short random code for manual entry at the door. */
    manualCode: text("manual_code").notNull().unique(),
    status: ticketStatus("status").notNull().default("valid"),
    isDemo: boolean("is_demo").notNull().default(false),
    voidReason: text("void_reason"),
    voidedAt: ts("voided_at"),
    checkedInAt: ts("checked_in_at"),
    checkedInBy: text("checked_in_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("tickets_booking_index_uq").on(t.bookingId, t.ticketIndex),
    index("tickets_user_idx").on(t.userId),
    check("tickets_index_positive", sql`${t.ticketIndex} >= 1`),
  ],
);

export const checkInEvents = pgTable(
  "check_in_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
    staffUserId: text("staff_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    result: text("result").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("check_in_events_ticket_idx").on(t.ticketId)],
);

/* ------------------------------------------------------------------ */
/* Email outbox                                                         */
/* ------------------------------------------------------------------ */

export const emailStatus = pgEnum("email_status", ["pending", "sending", "sent", "failed"]);

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "cascade" }),
    toEmail: text("to_email").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    status: emailStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    lockedAt: ts("locked_at"),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    sentAt: ts("sent_at"),
    createdAt: createdAt(),
  },
  (t) => [index("email_outbox_due_idx").on(t.status, t.nextAttemptAt)],
);

/* ------------------------------------------------------------------ */
/* Admin audit trail                                                    */
/* ------------------------------------------------------------------ */

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: text("actor_user_id"),
    actorLabel: text("actor_label"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    details: jsonb("details").notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_events_created_idx").on(t.createdAt), index("audit_events_target_idx").on(t.targetType, t.targetId)],
);

/* ------------------------------------------------------------------ */
/* App rate limits (fixed window, shared via Postgres)                  */
/* ------------------------------------------------------------------ */

export const appRateLimits = pgTable("app_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: ts("reset_at").notNull(),
});

export const schema = {
  user,
  session,
  account,
  verification,
  rateLimit,
  eventSettings,
  referralCodes,
  coupons,
  bookings,
  bookingEvents,
  inventoryHolds,
  couponReservations,
  paymentProofs,
  tickets,
  checkInEvents,
  emailOutbox,
  auditEvents,
  appRateLimits,
};

export type Booking = typeof bookings.$inferSelect;
export type EventSettingsRow = typeof eventSettings.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type PaymentProof = typeof paymentProofs.$inferSelect;
export type UserRow = typeof user.$inferSelect;
