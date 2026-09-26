"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, FormAlert } from "@/components/ui/field";
import { authClient } from "@/lib/auth/client";
import { emailSchema, safeNextPath } from "@/lib/validation";

export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);
  const target = safeNextPath(next, "/account");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const em = emailSchema.safeParse(email);
    const fe: typeof fieldErrors = {};
    if (!em.success) fe.email = "Enter a valid email address.";
    if (!password) fe.password = "Enter your password.";
    setFieldErrors(fe);
    if (fe.email || fe.password) return;
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.email({ email: em.data!, password });
    if (error) {
      setBusy(false);
      setError(
        error.status === 429
          ? "Too many attempts. Please wait a minute and try again."
          : error.status === 401
            ? "That email and password don’t match."
            : (error.message ?? "We couldn’t log you in. Please try again."),
      );
      return;
    }
    router.replace(target);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" data-no-glitter>
      {error && <FormAlert>{error}</FormAlert>}
      <Field
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldErrors.email}
        required
      />
      <Field
        label="Password"
        type="password"
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password}
        required
      />
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-semibold text-gold underline-offset-4 hover:underline">
          Forgot password?
        </Link>
      </div>
      <button type="submit" className="btn-gold min-h-14 w-full text-base" disabled={busy}>
        {busy && <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />}
        {busy ? "Logging in…" : "Log in"}
      </button>
      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link
          href={`/signup${next ? `?next=${encodeURIComponent(target)}` : ""}`}
          className="font-semibold text-gold underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
