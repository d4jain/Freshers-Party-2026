"use client";

import { ArrowLeft, ArrowRight, LoaderCircle, Lock, ShieldCheck, TicketCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { TransitionPanel } from "@/components/motion-primitives/transition-panel";
import { ResendVerification } from "@/components/auth/password-forms";
import { Field, FormAlert } from "@/components/ui/field";
import { ELIGIBILITY_ACK_TEXT } from "@/config/event";
import type { CheckoutPayload } from "@/lib/booking/checkout";
import { formatINR } from "@/lib/money";
import { priceBooking, type PriceBreakdown } from "@/lib/pricing";
import { useHydrated, usePrefersReducedMotion } from "@/lib/hooks/client-state";
import { bookingRequestSchema } from "@/lib/validation";
import { OrderSummary } from "./order-summary";
import { Stepper } from "./stepper";
import { useCheckoutRunner } from "./use-checkout";

export type BookingFlowProps = {
  user: { name: string; email: string; phone: string; emailVerified: boolean; signupReferralCode: string | null } | null;
  config: {
    unitPricePaise: number;
    compareAtPricePaise: number | null;
    bookingFeePaise: number;
    bookingFeeLabel: string | null;
    maxGroupSize: number;
    policyVersion: number;
    holdMinutes: number;
  };
  sales: { open: boolean; message: string | null; setupHint: string | null };
  demo: boolean;
  requireVerifiedEmail: boolean;
};

type Draft = { total: number; girls: number; boys: number; couponCode: string; referralCode: string; resumeAtDetails?: boolean };
const DRAFT_KEY = "fp26-booking-draft";
const STEPS = ["Your group", "Your details", "Review & pay"] as const;

function readDraft(): Partial<Draft> | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Partial<Draft>) : null;
  } catch {
    return null;
  }
}
function writeDraft(d: Draft) {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* ignore */
  }
}
function clearDraft() {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Server-renders with defaults, then remounts once after hydration with any
 * saved draft (kept across login/signup in sessionStorage) — no state
 * juggling in effects and no hydration mismatch.
 */
export function BookingFlow(props: BookingFlowProps) {
  const hydrated = useHydrated();
  const draft = hydrated ? readDraft() : null;
  return <BookingFlowInner key={hydrated ? "client" : "server"} {...props} draft={draft} persist={hydrated} />;
}

function BookingFlowInner({
  user,
  config,
  sales,
  demo,
  requireVerifiedEmail,
  draft,
  persist,
}: BookingFlowProps & { draft: Partial<Draft> | null; persist: boolean }) {
  const router = useRouter();
  const reduce = usePrefersReducedMotion();
  const runner = useCheckoutRunner();
  const initialTotal = Math.min(config.maxGroupSize, Math.max(1, Math.trunc(draft?.total ?? 1)));
  const initialGirls = Math.min(initialTotal, Math.max(0, Math.trunc(draft?.girls ?? 0)));
  // Return to the details step only when the user was sent off to log in.
  const [step, setStep] = useState(draft?.resumeAtDetails && user ? 1 : 0);
  const [dir, setDir] = useState(1);
  const [total, setTotal] = useState(initialTotal);
  const [girls, setGirls] = useState(initialGirls);
  const [boys, setBoys] = useState(Math.min(initialTotal, Math.max(0, Math.trunc(draft?.boys ?? initialTotal - initialGirls))));
  const [bookerName, setBookerName] = useState(user?.name ?? "");
  const [bookerPhone, setBookerPhone] = useState(user?.phone ?? "");
  const [bookerEmail, setBookerEmail] = useState(user?.email ?? "");
  const [couponInput, setCouponInput] = useState(draft?.couponCode ?? "");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponBreakdown, setCouponBreakdown] = useState<PriceBreakdown | null>(null);
  const [couponMsg, setCouponMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [referralCode, setReferralCode] = useState(draft?.referralCode ?? "");
  const [eligibilityAck, setEligibilityAck] = useState(false);
  const [termsAck, setTermsAck] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverBreakdown, setServerBreakdown] = useState<PriceBreakdown | null>(null);
  const headingRefs = useRef<(HTMLHeadingElement | null)[]>([]);
  const keyRef = useRef<{ fp: string; key: string } | null>(null);

  // Persist the draft (quantities and codes only — nothing sensitive). Only
  // the post-hydration instance writes, so it can't clobber a saved draft.
  useEffect(() => {
    if (!persist) return;
    writeDraft({ total, girls, boys, couponCode: appliedCoupon ?? couponInput, referralCode, resumeAtDetails: false });
  }, [persist, total, girls, boys, couponInput, appliedCoupon, referralCode]);

  const baseBreakdown = useMemo(() => {
    const r = priceBooking({
      quantity: total,
      unitPricePaise: config.unitPricePaise,
      compareAtPricePaise: config.compareAtPricePaise,
      bookingFeePaise: config.bookingFeePaise,
      bookingFeeLabel: config.bookingFeeLabel,
      now: new Date(),
    });
    return r.ok ? r.breakdown : null;
  }, [total, config]);

  const breakdown = serverBreakdown ?? (couponBreakdown && couponBreakdown.quantity === total ? couponBreakdown : baseBreakdown);
  const sumMismatch = girls + boys !== total;

  function setTotalKeepSum(t: number) {
    setTotal(t);
    const g = Math.min(girls, t);
    setGirls(g);
    setBoys(t - g);
    setServerBreakdown(null);
    if (appliedCoupon && t !== total) void applyCoupon(t, appliedCoupon);
  }
  function setGirlsKeepSum(g: number) {
    setGirls(g);
    setBoys(Math.max(0, total - g));
    setServerBreakdown(null);
  }

  function go(to: number) {
    setDir(to > step ? 1 : -1);
    setStep(to);
    setFormError(null);
    requestAnimationFrame(() => headingRefs.current[to]?.focus());
  }

  function validateGroup() {
    if (sumMismatch) {
      setErrors({ quantityTotal: "Girls + boys must add up to the total." });
      return false;
    }
    setErrors({});
    return true;
  }

  function validateDetails() {
    const parsed = bookingRequestSchema.safeParse(buildRequest(true));
    if (parsed.success) {
      setErrors({});
      return true;
    }
    const f = parsed.error.flatten().fieldErrors;
    const picked: Record<string, string> = {};
    for (const k of ["bookerName", "bookerPhone", "bookerEmail", "referralCode"] as const) if (f[k]?.[0]) picked[k] = f[k]![0]!;
    setErrors(picked);
    return Object.keys(picked).length === 0;
  }

  function buildRequest(forDetailsOnly = false) {
    const fp = JSON.stringify([total, girls, boys, appliedCoupon, referralCode, bookerName, bookerPhone, bookerEmail]);
    if (!keyRef.current || keyRef.current.fp !== fp) keyRef.current = { fp, key: crypto.randomUUID() };
    return {
      quantityTotal: total,
      quantityGirls: girls,
      quantityBoys: boys,
      couponCode: appliedCoupon,
      referralCode: referralCode || null,
      bookerName,
      bookerPhone,
      bookerEmail,
      eligibilityAck: forDetailsOnly ? true : eligibilityAck,
      termsAck: forDetailsOnly ? true : termsAck,
      termsPolicyVersion: config.policyVersion,
      idempotencyKey: keyRef.current.key,
    };
  }

  async function applyCoupon(quantity = total, codeOverride?: string) {
    const code = (codeOverride ?? couponInput).trim();
    if (!code) return;
    setCouponBusy(true);
    setCouponMsg(null);
    try {
      const res = await fetch("/api/bookings/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quantityTotal: quantity, couponCode: code }),
      });
      const body = await res.json();
      if (!res.ok) {
        setCouponMsg({ tone: "error", text: body.error?.message ?? "That coupon can’t be applied." });
        setAppliedCoupon(null);
        setCouponBreakdown(null);
      } else {
        setAppliedCoupon(body.breakdown.coupon.code);
        setCouponBreakdown(body.breakdown);
        setCouponMsg({
          tone: "success",
          text: `${body.breakdown.coupon.code} applied — you save ${formatINR(body.breakdown.discountPaise)}. Final check happens at payment.`,
        });
      }
    } catch {
      setCouponMsg({ tone: "error", text: "Couldn’t check the coupon. Try again." });
    } finally {
      setCouponBusy(false);
      setServerBreakdown(null);
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponBreakdown(null);
    setCouponInput("");
    setCouponMsg(null);
    setServerBreakdown(null);
  }

  const payDisabledReason = !sales.open
    ? (sales.message ?? "Booking isn’t open.")
    : requireVerifiedEmail && user && !user.emailVerified
      ? "Verify your email address to pay."
      : null;

  async function pay() {
    if (submitting || runner.busy) return;
    setSubmitting(true); // disables the button immediately
    setFormError(null);
    const req = buildRequest();
    const parsed = bookingRequestSchema.safeParse(req);
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors;
      setErrors(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v?.[0] ?? ""])));
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      });
      const body = (await res.json().catch(() => ({}))) as {
        checkout?: CheckoutPayload;
        error?: { code: string; message: string; setupHint?: string };
      };
      if (!res.ok || !body.checkout) {
        const e = body.error;
        if (e?.code === "COUPON_EXHAUSTED" || e?.code === "COUPON_USER_LIMIT" || e?.code === "COUPON_EXPIRED") removeCoupon();
        setFormError(e?.message ?? "Something went wrong. Please try again.");
        return;
      }
      const c = body.checkout;
      if (c.status !== "pending_payment") {
        clearDraft();
        router.push(`/account/bookings/${c.bookingId}`);
        return;
      }
      if (breakdown && c.totalPaise !== breakdown.totalPaise) {
        setServerBreakdown(c.breakdown);
        setFormError(`The total is now ${formatINR(c.totalPaise)}. Please review it and tap Continue again.`);
        return;
      }
      clearDraft();
      runner.start(c);
    } catch {
      setFormError("Network problem — nothing was charged. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || runner.busy;

  const panels = [
    // Step 1 — group
    <section key="group" aria-labelledby="step-0" className="space-y-6">
      <h2
        id="step-0"
        ref={(el) => {
          headingRefs.current[0] = el;
        }}
        tabIndex={-1}
        className="display text-3xl text-ivory outline-none sm:text-4xl"
      >
        Who’s <em className="text-gold">coming?</em>
      </h2>
      <p className="text-mist">Same price for everyone. Every person must be a first-year Bennett University student.</p>
      <Stepper
        label="Total people"
        value={total}
        min={1}
        max={config.maxGroupSize}
        onChange={setTotalKeepSum}
        hint={`Up to ${config.maxGroupSize} per booking.`}
        error={errors.quantityTotal}
      />
      <div className="grid gap-6 sm:grid-cols-2">
        <Stepper label="Girls" value={girls} min={0} max={total} onChange={setGirlsKeepSum} />
        <Stepper
          label="Boys"
          value={boys}
          min={0}
          max={total}
          onChange={(b) => {
            setBoys(b);
            setServerBreakdown(null);
          }}
          error={sumMismatch ? `Girls + boys = ${girls + boys}, but total is ${total}.` : undefined}
        />
      </div>
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-gold/15 bg-ink-2/80 px-4 py-3">
        <span className="text-sm text-mist">
          {total} × {formatINR(config.unitPricePaise)}
        </span>
        <span className="display text-2xl text-gold">{breakdown ? formatINR(breakdown.totalPaise) : "—"}</span>
      </div>
      <button type="button" className="btn-gold min-h-14 w-full text-base sm:w-auto" onClick={() => validateGroup() && go(1)}>
        Continue <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </section>,

    // Step 2 — details
    <section key="details" aria-labelledby="step-1" className="space-y-5">
      <h2
        id="step-1"
        ref={(el) => {
          headingRefs.current[1] = el;
        }}
        tabIndex={-1}
        className="display text-3xl text-ivory outline-none sm:text-4xl"
      >
        Your <em className="text-gold">details</em>
      </h2>
      {!user ? (
        <div className="space-y-4">
          <p className="text-mist">Log in or create an account to continue. Your group details are saved on this device.</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login?next=%2Fbook"
              className="btn-gold"
              onClick={() => writeDraft({ total, girls, boys, couponCode: couponInput, referralCode, resumeAtDetails: true })}
            >
              Log in
            </Link>
            <Link
              href="/signup?next=%2Fbook"
              className="btn-ghost"
              onClick={() => writeDraft({ total, girls, boys, couponCode: couponInput, referralCode, resumeAtDetails: true })}
            >
              Create account
            </Link>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ivory"
            onClick={() => go(0)}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
          </button>
        </div>
      ) : (
        <>
          <p className="text-mist">We’ve filled these in from your account. Passes and the confirmation go to this booking.</p>
          <Field
            label="Booker name"
            autoComplete="name"
            value={bookerName}
            onChange={(e) => setBookerName(e.target.value)}
            error={errors.bookerName}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={bookerPhone}
              onChange={(e) => setBookerPhone(e.target.value)}
              error={errors.bookerPhone}
            />
            <Field
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={bookerEmail}
              onChange={(e) => setBookerEmail(e.target.value)}
              error={errors.bookerEmail}
            />
          </div>
          <div>
            <label htmlFor="coupon" className="field-label">
              Coupon code <span className="font-normal text-muted">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                id="coupon"
                className="field uppercase"
                value={appliedCoupon ?? couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                disabled={Boolean(appliedCoupon)}
                autoCapitalize="characters"
                aria-describedby="coupon-msg"
              />
              {appliedCoupon ? (
                <button type="button" className="btn-ghost shrink-0" onClick={removeCoupon}>
                  Remove
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-ghost shrink-0"
                  onClick={() => void applyCoupon()}
                  disabled={couponBusy || !couponInput.trim()}
                >
                  {couponBusy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-label="Checking" /> : "Apply"}
                </button>
              )}
            </div>
            <p id="coupon-msg" className={couponMsg?.tone === "error" ? "field-error" : "field-hint"} aria-live="polite">
              {couponMsg?.text ?? "One coupon per booking."}
            </p>
          </div>
          <Field
            label="Referral code"
            optional
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
            error={errors.referralCode}
            hint={
              user.signupReferralCode && !referralCode
                ? `Your signup referral (${user.signupReferralCode}) will be credited. Referral codes aren’t discounts.`
                : "Credits whoever referred you. Not a discount."
            }
          />
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button type="button" className="btn-ghost" onClick={() => go(0)}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
            </button>
            <button type="button" className="btn-gold min-h-14 text-base" onClick={() => validateDetails() && go(2)}>
              Review order <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </section>,

    // Step 3 — review & pay
    <section key="review" aria-labelledby="step-2" className="space-y-6">
      <h2
        id="step-2"
        ref={(el) => {
          headingRefs.current[2] = el;
        }}
        tabIndex={-1}
        className="display text-3xl text-ivory outline-none sm:text-4xl"
      >
        Review & <em className="text-gold">pay</em>
      </h2>
      {breakdown && (
        <div className="rounded-2xl border border-gold/20 bg-ink-2/80 p-5">
          <OrderSummary breakdown={breakdown} girls={girls} boys={boys} />
        </div>
      )}
      <div className="rounded-2xl border border-gold/15 p-4 text-sm text-mist">
        <p>
          <span className="text-muted">Booker:</span> {bookerName} · {bookerPhone} · {bookerEmail}
        </p>
        {(referralCode || user?.signupReferralCode) && (
          <p className="mt-1">
            <span className="text-muted">Referral:</span> {referralCode || user?.signupReferralCode}
          </p>
        )}
      </div>
      <fieldset className="space-y-4">
        <legend className="sr-only">Confirmations</legend>
        <label className="flex items-start gap-3 rounded-2xl border border-gold/15 p-4 text-[0.95rem] text-ivory">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0 accent-[#d7b777]"
            checked={eligibilityAck}
            onChange={(e) => setEligibilityAck(e.target.checked)}
            aria-describedby="elig-err"
          />
          <span>{ELIGIBILITY_ACK_TEXT}</span>
        </label>
        {errors.eligibilityAck && (
          <p id="elig-err" className="field-error">
            {errors.eligibilityAck}
          </p>
        )}
        <label className="flex items-start gap-3 rounded-2xl border border-gold/15 p-4 text-[0.95rem] text-ivory">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0 accent-[#d7b777]"
            checked={termsAck}
            onChange={(e) => setTermsAck(e.target.checked)}
            aria-describedby="terms-err"
          />
          <span>
            I accept the{" "}
            <Link href="/terms" target="_blank" className="font-semibold text-gold underline underline-offset-4">
              event terms
            </Link>{" "}
            and the{" "}
            <Link href="/refund-policy" target="_blank" className="font-semibold text-gold underline underline-offset-4">
              cancellation & refund policy
            </Link>
            .
          </span>
        </label>
        {errors.termsAck && (
          <p id="terms-err" className="field-error">
            {errors.termsAck}
          </p>
        )}
      </fieldset>

      {formError && <FormAlert>{formError}</FormAlert>}
      {payDisabledReason && (
        <FormAlert tone="info">
          {payDisabledReason}
          {sales.setupHint && <span className="mt-1 block text-xs text-muted">{sales.setupHint}</span>}
          {user && !user.emailVerified && requireVerifiedEmail && (
            <span className="mt-3 block">
              <ResendVerification email={user.email} />
            </span>
          )}
        </FormAlert>
      )}
      {demo && (
        <p className="rounded-xl border border-dashed border-danger/50 px-3 py-2 text-xs font-semibold text-[#ffd3cb]">
          Demo mode: bookings and passes are marked DEMO and are not valid for entry.
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" className="btn-ghost" onClick={() => go(1)} disabled={busy}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
        </button>
        <button
          type="button"
          className="btn-gold min-h-14 px-8 text-lg"
          onClick={() => void pay()}
          disabled={busy || Boolean(payDisabledReason)}
          aria-describedby="pay-note"
        >
          {submitting ? (
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <Lock className="h-4 w-4" aria-hidden="true" />
          )}
          {submitting
            ? "Holding your places…"
            : breakdown
              ? `Continue to pay ${formatINR(breakdown.totalPaise)}`
              : "Continue to pay"}
        </button>
      </div>
      <p id="pay-note" className="flex items-start gap-2 text-xs text-muted">
        <ShieldCheck className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
        Next you’ll see a UPI QR for the exact amount. Pay with any UPI app, then upload your payment screenshot and transaction
        ID. Your places are held for {config.holdMinutes} minutes; organisers verify every payment before passes are issued.
      </p>
    </section>,
  ];

  return (
    <div data-no-glitter>
      <ol className="mb-8 grid grid-cols-3 gap-2" aria-label="Booking steps">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined} className="flex flex-col gap-2">
            <span className={`h-1 rounded-full transition-colors duration-500 ${i <= step ? "bg-gold" : "bg-ivory/15"}`} />
            <span className={`text-xs font-bold ${i === step ? "text-gold" : "text-muted"}`}>
              {i + 1}. {label}
            </span>
          </li>
        ))}
      </ol>
      <TransitionPanel
        activeIndex={step}
        custom={dir}
        transition={reduce ? { duration: 0 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        variants={{
          enter: (d: number) => ({ x: reduce ? 0 : d * 40, opacity: 0, filter: reduce ? "none" : "blur(4px)" }),
          center: { x: 0, opacity: 1, filter: "blur(0px)" },
          exit: (d: number) => ({ x: reduce ? 0 : d * -40, opacity: 0, filter: reduce ? "none" : "blur(4px)" }),
        }}
      >
        {panels}
      </TransitionPanel>
      {runner.overlays}
      <p className="mt-10 flex items-center gap-2 text-xs text-muted">
        <TicketCheck className="h-4 w-4 text-gold" aria-hidden="true" />
        Your booking is confirmed only after the organisers verify your payment.
      </p>
    </div>
  );
}
