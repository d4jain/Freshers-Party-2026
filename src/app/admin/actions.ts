"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth/session";
import { applyPaymentUpdate } from "@/lib/booking/confirm";
import { reconcileBooking } from "@/lib/booking/reconcile";
import { isValidCodeFormat, normalizeCode } from "@/lib/codes";
import { getDb } from "@/lib/db";
import { bookingExceptions, bookings, coupons, eventSettings, paymentAttempts, referralCodes } from "@/lib/db/schema";
import { enqueueResend, processEmailOutbox } from "@/lib/email/outbox";
import { env } from "@/lib/env";
import { istLocalToDate } from "@/lib/format";
import { getGateway } from "@/lib/payments";
import { normalizeIndianMobile } from "@/lib/phone";
import { getSettings } from "@/lib/settings";
import { voidTicket } from "@/lib/tickets/checkin";

export type ActionResult = { ok: boolean; message: string } | null;

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") throw new Error("Forbidden");
  return user;
}

const ok = (message: string): ActionResult => ({ ok: true, message });
const fail = (message: string): ActionResult => ({ ok: false, message });

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}
function intOrNull(fd: FormData, key: string): number | null | "invalid" {
  const v = str(fd, key);
  if (v == null) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : "invalid";
}
function rupeesToPaise(fd: FormData, key: string): number | null | "invalid" {
  const v = str(fd, key);
  if (v == null) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return "invalid";
  return Math.round(Number(v) * 100);
}

const mediaSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(60),
      kind: z.enum(["venue", "previous_event", "mood"]),
      type: z.enum(["image", "video"]),
      src: z
        .string()
        .min(1)
        .max(500)
        .refine((s) => s.startsWith("/") || s.startsWith("https://"), "Use a /public path or an https:// URL"),
      poster: z.string().max(500).optional(),
      alt: z.string().min(3).max(200),
      caption: z.string().min(3).max(200),
      credit: z.string().max(200).optional(),
    }),
  )
  .max(30);

export async function saveSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const db = getDb();
  const current = await getSettings(db);

  const price = rupeesToPaise(fd, "unitPrice");
  const compare = rupeesToPaise(fd, "compareAtPrice");
  const fee = rupeesToPaise(fd, "bookingFee");
  const capacity = intOrNull(fd, "capacity");
  const maxGroup = intOrNull(fd, "maxGroupSize");
  const hold = intOrNull(fd, "holdMinutes");
  if (price === "invalid" || price == null || price <= 0) return fail("Ticket price must be a positive amount in rupees.");
  if (compare === "invalid") return fail("Previous price must be an amount in rupees.");
  if (fee === "invalid") return fail("Booking fee must be an amount in rupees.");
  if (capacity === "invalid") return fail("Capacity must be a whole number.");
  if (maxGroup === "invalid" || maxGroup == null || maxGroup < 1 || maxGroup > 50) return fail("Max group size must be 1–50.");
  if (hold === "invalid" || hold == null || hold < 5 || hold > 60) return fail("Hold time must be 5–60 minutes.");

  const parseIst = (key: string): Date | null | "invalid" => {
    const v = str(fd, key);
    if (v == null) return null;
    return istLocalToDate(v) ?? "invalid";
  };
  const startsAt = parseIst("startsAt");
  const endsAt = parseIst("endsAt");
  const salesOpenAt = parseIst("salesOpenAt");
  const salesCloseAt = parseIst("salesCloseAt");
  const offerExpiresAt = parseIst("offerExpiresAt");
  for (const [k, v] of Object.entries({ startsAt, endsAt, salesOpenAt, salesCloseAt, offerExpiresAt })) {
    if (v === "invalid") return fail(`${k}: use the date/time picker.`);
  }
  if (startsAt instanceof Date && endsAt instanceof Date && endsAt <= startsAt)
    return fail("End time must be after the start time.");

  const organiserPhone = str(fd, "organiserPhone");
  const organiserWhatsapp = str(fd, "organiserWhatsapp");
  for (const [label, v] of [
    ["Organiser phone", organiserPhone],
    ["Organiser WhatsApp", organiserWhatsapp],
  ] as const) {
    if (v && !normalizeIndianMobile(v)) return fail(`${label} must be a valid Indian mobile number.`);
  }
  const organiserEmail = str(fd, "organiserEmail");
  if (organiserEmail && !z.email().safeParse(organiserEmail).success) return fail("Organiser email isn’t valid.");
  for (const key of ["venueWebsite", "venueMapUrl", "whatsappGroupUrl"]) {
    const v = str(fd, key);
    if (v && !/^https:\/\//.test(v)) return fail(`${key} must start with https://`);
  }

  let approvedMedia = current.approvedMedia;
  const mediaRaw = str(fd, "approvedMedia");
  try {
    approvedMedia = mediaSchema.parse(mediaRaw ? JSON.parse(mediaRaw) : []);
  } catch (e) {
    return fail(`Approved media JSON is invalid: ${e instanceof Error ? e.message.slice(0, 160) : "parse error"}`);
  }

  const heroMp4 = str(fd, "heroVideoMp4");
  const heroWebm = str(fd, "heroVideoWebm");
  const heroPoster = str(fd, "heroVideoPoster");

  const termsText = str(fd, "termsText");
  const privacyText = str(fd, "privacyText");
  const refundPolicyText = str(fd, "refundPolicyText");
  const policiesChanged =
    termsText !== current.termsText || privacyText !== current.privacyText || refundPolicyText !== current.refundPolicyText;
  const policiesApproved = fd.get("policiesApproved") === "on";
  if (policiesApproved && (!termsText || !privacyText || !refundPolicyText)) {
    return fail("Add terms, privacy and refund policy text before approving policies.");
  }
  const salesEnabled = fd.get("salesEnabled") === "on";
  if (salesEnabled && (!policiesApproved || capacity == null)) {
    return fail("Live sales need an approved policy set and a capacity.");
  }

  const next = {
    eventName: str(fd, "eventName") ?? current.eventName,
    startsAt: startsAt as Date | null,
    endsAt: endsAt as Date | null,
    venueAddress: str(fd, "venueAddress"),
    venueWebsite: str(fd, "venueWebsite"),
    venueMapUrl: str(fd, "venueMapUrl"),
    unitPricePaise: price,
    compareAtPricePaise: compare as number | null,
    bookingFeePaise: (fee as number | null) ?? 0,
    bookingFeeLabel: str(fd, "bookingFeeLabel"),
    capacity: capacity as number | null,
    maxGroupSize: maxGroup,
    holdMinutes: hold,
    salesOpenAt: salesOpenAt as Date | null,
    salesCloseAt: salesCloseAt as Date | null,
    offerExpiresAt: offerExpiresAt as Date | null,
    salesEnabled,
    organiserName: str(fd, "organiserName"),
    organiserPhone: organiserPhone ? normalizeIndianMobile(organiserPhone) : null,
    organiserWhatsapp: organiserWhatsapp ? normalizeIndianMobile(organiserWhatsapp) : null,
    organiserEmail,
    organiserInstagram: str(fd, "organiserInstagram"),
    whatsappGroupUrl: str(fd, "whatsappGroupUrl"),
    drinksDetails: str(fd, "drinksDetails"),
    termsText,
    privacyText,
    refundPolicyText,
    policiesApproved,
    approvedMedia,
    heroVideo:
      heroMp4 || heroWebm ? { mp4: heroMp4 ?? undefined, webm: heroWebm ?? undefined, poster: heroPoster ?? undefined } : null,
  };

  const changed = Object.keys(next).filter((k) => {
    const a = (current as Record<string, unknown>)[k];
    const b = (next as Record<string, unknown>)[k];
    return JSON.stringify(a instanceof Date ? a.toISOString() : a) !== JSON.stringify(b instanceof Date ? b.toISOString() : b);
  });
  if (changed.length === 0) return ok("No changes.");

  await db.transaction(async (tx) => {
    await tx
      .update(eventSettings)
      .set({
        ...next,
        version: sql`${eventSettings.version} + 1`,
        policyVersion: policiesChanged ? sql`${eventSettings.policyVersion} + 1` : eventSettings.policyVersion,
        updatedBy: admin.id,
      })
      .where(eq(eventSettings.id, "main"));
    const summary: Record<string, unknown> = {};
    for (const k of changed) {
      if (k.endsWith("Text")) summary[k] = "(text changed)";
      else
        summary[k] = { from: (current as Record<string, unknown>)[k] ?? null, to: (next as Record<string, unknown>)[k] ?? null };
    }
    await recordAudit(tx, {
      actorUserId: admin.id,
      action: "settings.update",
      targetType: "event_settings",
      targetId: "main",
      details: summary,
    });
  });
  for (const p of ["/", "/book", "/terms", "/privacy", "/refund-policy", "/admin/settings"]) revalidatePath(p);
  return ok(
    `Saved ${changed.length} change${changed.length === 1 ? "" : "s"}. Existing bookings keep their original prices.${policiesChanged ? " Policy version bumped — buyers must accept the new text." : ""}`,
  );
}

export async function createCoupon(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const code = normalizeCode(str(fd, "code"));
  if (!code || !isValidCodeFormat(code)) return fail("Code: 3–24 letters, numbers or hyphens.");
  const type = str(fd, "discountType");
  const amount = rupeesToPaise(fd, "amountOff");
  const percent = intOrNull(fd, "percentOff");
  const maxDiscount = rupeesToPaise(fd, "maxDiscount");
  const minQuantity = intOrNull(fd, "minQuantity");
  const minSubtotal = rupeesToPaise(fd, "minSubtotal");
  const maxRedemptions = intOrNull(fd, "maxRedemptions");
  const perUserLimit = intOrNull(fd, "perUserLimit");
  const expiresRaw = str(fd, "expiresAt");
  const startsRaw = str(fd, "startsAt");
  const expiresAt = expiresRaw ? istLocalToDate(expiresRaw) : null;
  const startsAt = startsRaw ? istLocalToDate(startsRaw) : null;
  if ([amount, percent, maxDiscount, minQuantity, minSubtotal, maxRedemptions, perUserLimit].includes("invalid"))
    return fail("Check the numeric fields.");
  if (type === "fixed" && !(typeof amount === "number" && amount > 0)) return fail("Fixed coupons need an amount off.");
  if (type === "percent" && !(typeof percent === "number" && percent >= 1 && percent <= 90))
    return fail("Percent coupons need 1–90%.");
  if (type !== "fixed" && type !== "percent") return fail("Choose a discount type.");
  if ((expiresRaw && !expiresAt) || (startsRaw && !startsAt)) return fail("Use the date/time pickers.");
  const db = getDb();
  try {
    const [c] = await db
      .insert(coupons)
      .values({
        code,
        description: str(fd, "description"),
        discountType: type,
        amountOffPaise: type === "fixed" ? (amount as number) : null,
        percentOff: type === "percent" ? (percent as number) : null,
        maxDiscountPaise: (maxDiscount as number | null) || null,
        minQuantity: (minQuantity as number | null) || null,
        minSubtotalPaise: (minSubtotal as number | null) || null,
        maxRedemptions: (maxRedemptions as number | null) || null,
        perUserLimit: (perUserLimit as number | null) || null,
        startsAt,
        expiresAt,
        createdBy: admin.id,
      })
      .returning();
    await recordAudit(db, {
      actorUserId: admin.id,
      action: "coupon.create",
      targetType: "coupon",
      targetId: c!.id,
      details: { code },
    });
  } catch {
    return fail("That coupon code already exists or is invalid.");
  }
  revalidatePath("/admin/coupons");
  return ok(`Coupon ${code} created.`);
}

export async function setCouponActive(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const active = fd.get("active") === "true";
  if (!id) return fail("Missing coupon.");
  const db = getDb();
  await db.update(coupons).set({ active }).where(eq(coupons.id, id));
  await recordAudit(db, {
    actorUserId: admin.id,
    action: active ? "coupon.activate" : "coupon.deactivate",
    targetType: "coupon",
    targetId: id,
  });
  revalidatePath("/admin/coupons");
  return ok(active ? "Coupon activated." : "Coupon deactivated.");
}

export async function createReferral(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const code = normalizeCode(str(fd, "code"));
  const label = str(fd, "label");
  const ownerType = str(fd, "ownerType");
  if (!code || !isValidCodeFormat(code)) return fail("Code: 3–24 letters, numbers or hyphens.");
  if (!label) return fail("Add a label (who or what this code is for).");
  if (ownerType !== "organiser" && ownerType !== "campaign") return fail("Choose organiser or campaign.");
  const db = getDb();
  try {
    const [r] = await db.insert(referralCodes).values({ code, label, ownerType, createdBy: admin.id }).returning();
    await recordAudit(db, {
      actorUserId: admin.id,
      action: "referral.create",
      targetType: "referral_code",
      targetId: r!.id,
      details: { code, label },
    });
  } catch {
    return fail("That referral code already exists.");
  }
  revalidatePath("/admin/referrals");
  return ok(`Referral code ${code} created. It attributes signups/bookings — it gives no discount.`);
}

export async function setReferralActive(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const active = fd.get("active") === "true";
  if (!id) return fail("Missing code.");
  const db = getDb();
  await db.update(referralCodes).set({ active }).where(eq(referralCodes.id, id));
  await recordAudit(db, {
    actorUserId: admin.id,
    action: active ? "referral.activate" : "referral.deactivate",
    targetType: "referral_code",
    targetId: id,
  });
  revalidatePath("/admin/referrals");
  return ok(active ? "Code activated." : "Code deactivated (existing attribution is unchanged).");
}

export async function resendConfirmation(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = str(fd, "bookingId");
  if (!id) return fail("Missing booking.");
  const db = getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  if (!b || b.status !== "confirmed") return fail("Only confirmed bookings get confirmation emails.");
  await enqueueResend(db, b.id, b.bookerEmail);
  await recordAudit(db, { actorUserId: admin.id, action: "booking.resend_email", targetType: "booking", targetId: b.id });
  const res = await processEmailOutbox(db, { appUrl: env().APP_URL, onlyBookingId: b.id, limit: 5 });
  revalidatePath(`/admin/bookings/${b.id}`);
  return "skipped" in res
    ? ok("Queued. No email provider is configured, so it will send once one is.")
    : ok(`Queued and processed (sent: ${res.sent}, failed: ${res.failed}).`);
}

export async function syncWithGateway(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = str(fd, "bookingId");
  if (!id) return fail("Missing booking.");
  const gateway = getGateway();
  if (!gateway || gateway.provider !== "razorpay") return fail("Razorpay isn’t configured.");
  const db = getDb();
  try {
    const results = await reconcileBooking(db, gateway, id);
    await recordAudit(db, {
      actorUserId: admin.id,
      action: "booking.sync_gateway",
      targetType: "booking",
      targetId: id,
      details: { outcomes: results.map((r) => r.outcome) },
    });
    revalidatePath(`/admin/bookings/${id}`);
    return ok(
      results.length
        ? `Synced ${results.length} payment(s): ${results.map((r) => r.outcome).join(", ")}.`
        : "No payments found for this order.",
    );
  } catch {
    return fail("Couldn’t reach Razorpay. Try again.");
  }
}

/**
 * Re-runs the normal confirmation (with capacity check) for a booking in
 * review, using the payment as reported by Razorpay. This can never confirm
 * a booking without a captured payment for its exact amount.
 */
export async function retryConfirmation(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = str(fd, "bookingId");
  if (!id) return fail("Missing booking.");
  const db = getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  if (!b || b.status !== "needs_review" || !b.capturedPaymentId)
    return fail("Only bookings under review with a captured payment can be retried.");
  let payment;
  if (b.paymentProvider === "razorpay") {
    const gateway = getGateway();
    if (!gateway || gateway.provider !== "razorpay") return fail("Razorpay isn’t configured.");
    try {
      payment = await gateway.fetchPayment(b.capturedPaymentId);
    } catch {
      return fail("Couldn’t fetch the payment from Razorpay.");
    }
  } else {
    const [a] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.gatewayPaymentId, b.capturedPaymentId)).limit(1);
    if (!a) return fail("No payment record.");
    payment = {
      id: a.gatewayPaymentId,
      orderId: a.gatewayOrderId,
      amountPaise: a.amountPaise,
      currency: a.currency,
      status: a.status,
      amountRefundedPaise: a.amountRefundedPaise,
      method: a.method,
      errorCode: a.errorCode,
      errorDescription: a.errorDescription,
      capturedAt: a.capturedAt,
    };
  }
  const r = await applyPaymentUpdate(db, payment, "admin_retry");
  await recordAudit(db, {
    actorUserId: admin.id,
    action: "booking.retry_confirmation",
    targetType: "booking",
    targetId: id,
    details: { outcome: r.outcome },
  });
  revalidatePath(`/admin/bookings/${id}`);
  return r.outcome === "confirmed"
    ? ok("Confirmed and passes issued.")
    : fail(`Not confirmed (${r.outcome}). Resolve capacity or refund in Razorpay.`);
}

export async function resolveException(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const note = str(fd, "note");
  if (!id || !note || note.length < 5) return fail("Add a short resolution note (what you did, e.g. refunded in Razorpay).");
  const db = getDb();
  const [e] = await db
    .update(bookingExceptions)
    .set({ resolvedAt: new Date(), resolvedBy: admin.id, resolutionNote: note.slice(0, 500) })
    .where(and(eq(bookingExceptions.id, id), isNull(bookingExceptions.resolvedAt)))
    .returning();
  if (!e) return fail("Already resolved.");
  await recordAudit(db, {
    actorUserId: admin.id,
    action: "exception.resolve",
    targetType: "booking_exception",
    targetId: id,
    details: { kind: e.kind, note },
  });
  revalidatePath("/admin/exceptions");
  if (e.bookingId) revalidatePath(`/admin/bookings/${e.bookingId}`);
  return ok("Marked resolved.");
}

export async function voidTicketAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const ticketId = str(fd, "ticketId");
  const bookingId = str(fd, "bookingId");
  const reason = str(fd, "reason");
  if (!ticketId || !reason || reason.length < 5) return fail("Give a reason (e.g. partial refund for 1 person).");
  const done = await voidTicket(getDb(), { actorUserId: admin.id, ticketId, reason });
  if (bookingId) revalidatePath(`/admin/bookings/${bookingId}`);
  return done ? ok("Pass voided.") : fail("Pass was already void.");
}
