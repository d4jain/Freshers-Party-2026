"use client";

import { LoaderCircle, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Field, FormAlert } from "@/components/ui/field";
import { WhatsAppCta } from "@/components/ui/whatsapp-cta";
import { authClient } from "@/lib/auth/client";
import { safeNextPath, signupSchema } from "@/lib/validation";

type Errors = Partial<Record<"name" | "phone" | "email" | "password" | "confirmPassword" | "referralCode" | "form", string>>;

export function SignupForm({
  next,
  whatsappUrl,
  requireVerification,
}: {
  next: string | null;
  whatsappUrl: string;
  requireVerification: boolean;
}) {
  const [values, setValues] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
    referralCode: "",
    marketingOptIn: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ email: string } | null>(null);
  const target = safeNextPath(next, "/account");

  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const parsed = signupSchema.safeParse(values);
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors;
      setErrors(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v?.[0]])) as Errors);
      return;
    }
    setErrors({});
    setBusy(true);
    const d = parsed.data;
    const { error } = await authClient.signUp.email({
      name: d.name,
      email: d.email,
      password: d.password,
      phone: d.phone,
      marketingOptIn: d.marketingOptIn,
      signupReferralCode: d.referralCode ?? undefined,
      callbackURL: `/verify-email?next=${encodeURIComponent(target)}`,
    });
    setBusy(false);
    if (error) {
      const msg =
        error.status === 422
          ? "An account with this email already exists. Log in instead."
          : error.status === 429
            ? "Too many attempts. Please wait a few minutes and try again."
            : (error.message ?? "We couldn’t create your account. Please try again.");
      setErrors({ form: msg });
      return;
    }
    setDone({ email: d.email });
  }

  if (done) {
    return (
      <div className="space-y-6">
        <FormAlert tone="success">
          <span className="flex items-start gap-3">
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            {requireVerification ? (
              <span>
                Account created. We’ve sent a verification link to <strong>{done.email}</strong>. Verify your email before paying
                — it’s where your confirmation goes.
              </span>
            ) : (
              <span>
                Account created — you’re signed in as <strong>{done.email}</strong>. You can book right away.
              </span>
            )}
          </span>
        </FormAlert>
        <WhatsAppCta href={whatsappUrl} />
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href={target} className="btn-ghost">
            {target.startsWith("/book") ? "Continue to booking" : "Go to my account"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" data-no-glitter>
      {errors.form && <FormAlert>{errors.form}</FormAlert>}
      <Field
        label="Full name"
        name="name"
        autoComplete="name"
        value={values.name}
        onChange={set("name")}
        error={errors.name}
        required
      />
      <Field
        label="Phone number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="98765 43210"
        value={values.phone}
        onChange={set("phone")}
        error={errors.phone}
        hint="Indian mobile number. We store it as +91…"
        required
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={values.email}
        onChange={set("email")}
        error={errors.email}
        required
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={set("password")}
          error={errors.password}
          hint="At least 8 characters."
          required
        />
        <Field
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={values.confirmPassword}
          onChange={set("confirmPassword")}
          error={errors.confirmPassword}
          required
        />
      </div>
      <Field
        label="Referral code"
        name="referralCode"
        optional
        autoCapitalize="characters"
        value={values.referralCode}
        onChange={set("referralCode")}
        error={errors.referralCode}
        hint="Only if someone gave you one. It credits them — it isn’t a discount."
      />
      <label className="flex items-start gap-3 text-sm text-mist">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 accent-[#d7b777]"
          checked={values.marketingOptIn}
          onChange={set("marketingOptIn")}
        />
        <span>Optional: email me about future events from these organisers.</span>
      </label>
      <button type="submit" className="btn-gold min-h-14 w-full text-base" disabled={busy}>
        {busy && <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />}
        {busy ? "Creating your account…" : "Create account"}
      </button>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link
          href={`/login${next ? `?next=${encodeURIComponent(target)}` : ""}`}
          className="font-semibold text-gold underline-offset-4 hover:underline"
        >
          Log in
        </Link>
      </p>
    </form>
  );
}
