import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/password-forms";
import { PageTitle } from "@/components/site/page-shell";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <>
      <PageTitle
        eyebrow="Account"
        title={
          <>
            Forgot your <em className="text-gold">password?</em>
          </>
        }
      >
        Enter your email and we’ll send you a reset link.
      </PageTitle>
      <ForgotPasswordForm />
    </>
  );
}
