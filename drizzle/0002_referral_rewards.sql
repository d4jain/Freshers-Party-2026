CREATE TYPE "public"."payout_method" AS ENUM('cash', 'upi');--> statement-breakpoint
CREATE TABLE "referral_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_code_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"method" "payout_method" NOT NULL,
	"attended_at_payout" integer NOT NULL,
	"note" text,
	"paid_by" text NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_payouts_amount_positive" CHECK ("referral_payouts"."amount_paise" > 0)
);
--> statement-breakpoint
ALTER TABLE "referral_payouts" ADD CONSTRAINT "referral_payouts_referral_code_id_referral_codes_id_fk" FOREIGN KEY ("referral_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_payouts" ADD CONSTRAINT "referral_payouts_paid_by_user_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referral_payouts_code_idx" ON "referral_payouts" USING btree ("referral_code_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_one_per_user" ON "referral_codes" USING btree ("owner_user_id") WHERE owner_type = 'user';