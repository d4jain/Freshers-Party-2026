CREATE TYPE "public"."booking_status" AS ENUM('pending_payment', 'in_review', 'confirmed', 'rejected', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."coupon_reservation_status" AS ENUM('held', 'committed', 'released');--> statement-breakpoint
CREATE TYPE "public"."discount_type" AS ENUM('fixed', 'percent');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('pending', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."hold_status" AS ENUM('active', 'consumed', 'released');--> statement-breakpoint
CREATE TYPE "public"."referral_owner_type" AS ENUM('organiser', 'campaign', 'user');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('valid', 'void');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'staff', 'admin');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text,
	"actor_label" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text,
	"source" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"user_id" text NOT NULL,
	"status" "booking_status" DEFAULT 'pending_payment' NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"quantity_total" integer NOT NULL,
	"quantity_girls" integer NOT NULL,
	"quantity_boys" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"compare_at_price_paise" integer,
	"subtotal_paise" integer NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"fees_paise" integer DEFAULT 0 NOT NULL,
	"total_paise" integer NOT NULL,
	"pricing_snapshot" jsonb NOT NULL,
	"settings_version" integer NOT NULL,
	"coupon_id" uuid,
	"coupon_code" text,
	"referral_code_id" uuid,
	"referral_code" text,
	"referral_source" text,
	"booker_name" text NOT NULL,
	"booker_phone" text NOT NULL,
	"booker_email" text NOT NULL,
	"eligibility_ack_at" timestamp with time zone NOT NULL,
	"eligibility_ack_version" text NOT NULL,
	"eligibility_ack_text" text NOT NULL,
	"terms_ack_at" timestamp with time zone NOT NULL,
	"terms_ack_policy_version" integer NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"payment_submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"review_note" text,
	"hold_expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"status_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_reference_unique" UNIQUE("reference"),
	CONSTRAINT "bookings_qty_positive" CHECK ("bookings"."quantity_total" >= 1),
	CONSTRAINT "bookings_qty_nonneg" CHECK ("bookings"."quantity_girls" >= 0 AND "bookings"."quantity_boys" >= 0),
	CONSTRAINT "bookings_qty_sum" CHECK ("bookings"."quantity_girls" + "bookings"."quantity_boys" = "bookings"."quantity_total"),
	CONSTRAINT "bookings_amounts_nonneg" CHECK ("bookings"."unit_price_paise" > 0 AND "bookings"."subtotal_paise" >= 0 AND "bookings"."discount_paise" >= 0 AND "bookings"."fees_paise" >= 0),
	CONSTRAINT "bookings_total_positive" CHECK ("bookings"."total_paise" >= 100),
	CONSTRAINT "bookings_total_math" CHECK ("bookings"."subtotal_paise" = "bookings"."unit_price_paise" * "bookings"."quantity_total" AND "bookings"."total_paise" = "bookings"."subtotal_paise" - "bookings"."discount_paise" + "bookings"."fees_paise"),
	CONSTRAINT "bookings_currency_inr" CHECK ("bookings"."currency" = 'INR')
);
--> statement-breakpoint
CREATE TABLE "check_in_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid,
	"staff_user_id" text NOT NULL,
	"action" text NOT NULL,
	"result" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupon_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coupon_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" "coupon_reservation_status" DEFAULT 'held' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"committed_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"over_limit" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupon_reservations_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"discount_type" "discount_type" NOT NULL,
	"amount_off_paise" integer,
	"percent_off" integer,
	"max_discount_paise" integer,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"min_quantity" integer,
	"min_subtotal_paise" integer,
	"max_redemptions" integer,
	"per_user_limit" integer DEFAULT 1,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code"),
	CONSTRAINT "coupon_code_format" CHECK ("coupons"."code" ~ '^[A-Z0-9-]{3,24}$'),
	CONSTRAINT "coupon_value_shape" CHECK (("coupons"."discount_type" = 'fixed' AND "coupons"."amount_off_paise" > 0 AND "coupons"."percent_off" IS NULL)
       OR ("coupons"."discount_type" = 'percent' AND "coupons"."percent_off" BETWEEN 1 AND 90 AND "coupons"."amount_off_paise" IS NULL)),
	CONSTRAINT "coupon_limits_nonneg" CHECK (coalesce("coupons"."max_redemptions", 1) >= 1 AND coalesce("coupons"."per_user_limit", 1) >= 1),
	CONSTRAINT "coupon_mins_nonneg" CHECK (coalesce("coupons"."min_quantity", 1) >= 1 AND coalesce("coupons"."min_subtotal_paise", 0) >= 0),
	CONSTRAINT "coupon_max_discount_nonneg" CHECK (coalesce("coupons"."max_discount_paise", 1) > 0)
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"booking_id" uuid,
	"to_email" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" "email_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"provider_message_id" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_outbox_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "event_settings" (
	"id" text PRIMARY KEY DEFAULT 'main' NOT NULL,
	"event_name" text NOT NULL,
	"event_date" date NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"venue_name" text NOT NULL,
	"venue_branch" text NOT NULL,
	"venue_address" text,
	"venue_website" text,
	"venue_map_url" text,
	"currency" text DEFAULT 'INR' NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"compare_at_price_paise" integer,
	"booking_fee_paise" integer DEFAULT 0 NOT NULL,
	"booking_fee_label" text,
	"capacity" integer,
	"max_group_size" integer DEFAULT 10 NOT NULL,
	"hold_minutes" integer DEFAULT 30 NOT NULL,
	"sales_open_at" timestamp with time zone,
	"sales_close_at" timestamp with time zone,
	"offer_expires_at" timestamp with time zone,
	"sales_enabled" boolean DEFAULT false NOT NULL,
	"organiser_name" text,
	"organiser_phone" text,
	"organiser_whatsapp" text,
	"organiser_email" text,
	"organiser_instagram" text,
	"whatsapp_group_url" text,
	"upi_id" text,
	"upi_payee_name" text,
	"payment_qr_path" text,
	"drinks_details" text,
	"terms_text" text,
	"privacy_text" text,
	"refund_policy_text" text,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"policies_approved" boolean DEFAULT false NOT NULL,
	"approved_media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hero_video" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_settings_singleton" CHECK ("event_settings"."id" = 'main'),
	CONSTRAINT "event_settings_price_positive" CHECK ("event_settings"."unit_price_paise" > 0),
	CONSTRAINT "event_settings_fee_nonneg" CHECK ("event_settings"."booking_fee_paise" >= 0),
	CONSTRAINT "event_settings_capacity_nonneg" CHECK ("event_settings"."capacity" IS NULL OR "event_settings"."capacity" >= 0),
	CONSTRAINT "event_settings_group_positive" CHECK ("event_settings"."max_group_size" >= 1),
	CONSTRAINT "event_settings_hold_positive" CHECK ("event_settings"."hold_minutes" BETWEEN 5 AND 180)
);
--> statement-breakpoint
CREATE TABLE "inventory_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"status" "hold_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"release_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_holds_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "inventory_holds_qty_positive" CHECK ("inventory_holds"."quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "payment_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"utr" text NOT NULL,
	"payer_name" text,
	"amount_paise" integer NOT NULL,
	"image" "bytea" NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_proofs_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "payment_proofs_amount_positive" CHECK ("payment_proofs"."amount_paise" > 0),
	CONSTRAINT "payment_proofs_utr_format" CHECK ("payment_proofs"."utr" ~ '^[A-Z0-9]{6,35}$')
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"owner_type" "referral_owner_type" NOT NULL,
	"owner_user_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "referral_code_format" CHECK ("referral_codes"."code" ~ '^[A-Z0-9-]{3,24}$')
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"ticket_index" integer NOT NULL,
	"public_id" text NOT NULL,
	"manual_code" text NOT NULL,
	"status" "ticket_status" DEFAULT 'valid' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"void_reason" text,
	"voided_at" timestamp with time zone,
	"checked_in_at" timestamp with time zone,
	"checked_in_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "tickets_manual_code_unique" UNIQUE("manual_code"),
	CONSTRAINT "tickets_index_positive" CHECK ("tickets"."ticket_index" >= 1)
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"phone" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"signup_referral_code" text,
	"signup_referral_code_id" uuid,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_referral_code_id_referral_codes_id_fk" FOREIGN KEY ("referral_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_events" ADD CONSTRAINT "check_in_events_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_events" ADD CONSTRAINT "check_in_events_staff_user_id_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_reservations" ADD CONSTRAINT "coupon_reservations_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_reservations" ADD CONSTRAINT "coupon_reservations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_reservations" ADD CONSTRAINT "coupon_reservations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_holds" ADD CONSTRAINT "inventory_holds_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_checked_in_by_user_id_fk" FOREIGN KEY ("checked_in_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_signup_referral_code_id_referral_codes_id_fk" FOREIGN KEY ("signup_referral_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "booking_events_booking_idx" ON "booking_events" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_user_idempotency_uq" ON "bookings" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_one_pending_per_user_uq" ON "bookings" USING btree ("user_id") WHERE "bookings"."status" = 'pending_payment';--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bookings_created_idx" ON "bookings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "bookings_coupon_idx" ON "bookings" USING btree ("coupon_id");--> statement-breakpoint
CREATE INDEX "bookings_referral_idx" ON "bookings" USING btree ("referral_code_id");--> statement-breakpoint
CREATE INDEX "check_in_events_ticket_idx" ON "check_in_events" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "coupon_reservations_coupon_idx" ON "coupon_reservations" USING btree ("coupon_id","status");--> statement-breakpoint
CREATE INDEX "coupon_reservations_user_idx" ON "coupon_reservations" USING btree ("coupon_id","user_id","status");--> statement-breakpoint
CREATE INDEX "email_outbox_due_idx" ON "email_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "inventory_holds_active_idx" ON "inventory_holds" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "payment_proofs_utr_idx" ON "payment_proofs" USING btree ("utr");--> statement-breakpoint
CREATE INDEX "payment_proofs_sha_idx" ON "payment_proofs" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_booking_index_uq" ON "tickets" USING btree ("booking_id","ticket_index");--> statement-breakpoint
CREATE INDEX "tickets_user_idx" ON "tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_role_idx" ON "user" USING btree ("role");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");