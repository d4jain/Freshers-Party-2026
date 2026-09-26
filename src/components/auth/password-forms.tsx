"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Field, FormAlert } from "@/components/ui/field";
import { authClient } from "@/lib/auth/client";
import { emailSchema, PASSWORD_MAX, PASSWORD_MIN } from "@/lib/validation";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const em = emailSchema.safeParse(email);
    if (!em.success) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({ email: em.data, redirectTo: "/reset-password" });
    setBusy(false);
    if (error?.status === 429) {
      setError("Too many requests. Please wait a few minutes.");
      return;
    }
    setSent(true); // Same message whether or not the account exists.
  }

  if (sent) {
    return (
      <FormAlert tone="success">If an account exists for that email, a reset link is on its way. It expires in 1 hour.</FormAlert>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" data-no-glitter>
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error ?? undefined}
        required
      />
      <button type="submit" className="btn-gold min-h-14 w-full" disabled={busy}>
        {busy && <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />}
        Send reset link
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token, tokenError }: { token: string | null; tokenError: string | null }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (tokenError || !token) {
    return (
      <div className="space-y-4">
        <FormAlert>This reset link is invalid or has expired.</FormAlert>
        <Link href="/forgot-password" className="btn-ghost">
          Request a new link
        </Link>
      </div>
    );
  }
  if (done) {
    return (
      <div className="space-y-4">
        <FormAlert tone="success">Password updated. For your security, other sessions were signed out.</FormAlert>
        <Link href="/login" className="btn-gold">
          Log in
        </Link>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      setError(`Use ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don’t match.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token: token! });
    setBusy(false);
    if (error) {
      setError(
        error.status === 400
          ? "This reset link is invalid or has expired. Request a new one."
          : (error.message ?? "Couldn’t reset your password."),
      );
      return;
    }
    setDone(true);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" data-no-glitter>
      {error && <FormAlert>{error}</FormAlert>}
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint="At least 8 characters."
        required
      />
      <Field
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
      />
      <button type="submit" className="btn-gold min-h-14 w-full" disabled={busy}>
        {busy && <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />}
        Set new password
      </button>
    </form>
  );
}

export function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  return (
    <button
      type="button"
      className="btn-ghost"
      disabled={state === "busy" || state === "sent"}
      onClick={async () => {
        setState("busy");
        const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/verify-email" });
        setState(error ? "error" : "sent");
      }}
    >
      {state === "sent"
        ? "Verification email sent"
        : state === "error"
          ? "Couldn’t send — try again later"
          : "Resend verification email"}
    </button>
  );
}
