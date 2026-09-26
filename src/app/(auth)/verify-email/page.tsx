import type { Metadata } from "next";
import Link from "next/link";
import { ResendVerification } from "@/components/auth/password-forms";
import { PageTitle } from "@/components/site/page-shell";
import { FormAlert } from "@/components/ui/field";
import { WhatsAppCta } from "@/components/ui/whatsapp-cta";
import { EVENT_FACTS } from "@/config/event";
import { getSessionUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/validation";

export const metadata: Metadata = { title: "Verify email", robots: { index: false } };

export default async function VerifyEmailPage(props: PageProps<"/verify-email">) {
  const sp = await props.searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null, "/account");
  const user = await getSessionUser().catch(() => null);

  if (error) {
    return (
      <>
        <PageTitle eyebrow="Email verification" title="Link expired" />
        <div className="space-y-5">
          <FormAlert>This verification link is invalid or has expired.</FormAlert>
          {user && !user.emailVerified ? (
            <ResendVerification email={user.email} />
          ) : (
            <Link href="/login" className="btn-ghost">
              Log in to resend
            </Link>
          )}
        </div>
      </>
    );
  }
  if (user?.emailVerified) {
    return (
      <>
        <PageTitle
          eyebrow="Email verification"
          title={
            <>
              You’re <em className="text-gold">verified</em>
            </>
          }
        />
        <div className="space-y-6">
          <FormAlert tone="success">Thanks — your email is confirmed.</FormAlert>
          <WhatsAppCta href={EVENT_FACTS.whatsappGroupUrl} />
          <Link href={next} className="btn-ghost">
            {next.startsWith("/book") ? "Continue to booking" : "Go to my account"}
          </Link>
        </div>
      </>
    );
  }
  return (
    <>
      <PageTitle
        eyebrow="Email verification"
        title={
          <>
            Check your <em className="text-gold">inbox</em>
          </>
        }
      >
        Open the link we emailed you to verify your address. You’ll need a verified email to pay.
      </PageTitle>
      {user ? (
        <ResendVerification email={user.email} />
      ) : (
        <Link href="/login" className="btn-ghost">
          Log in
        </Link>
      )}
    </>
  );
}
