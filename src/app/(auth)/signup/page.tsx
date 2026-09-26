import type { Metadata } from "next";
import { PageTitle } from "@/components/site/page-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { EVENT_FACTS } from "@/config/event";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function SignupPage(props: PageProps<"/signup">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : null;
  return (
    <>
      <PageTitle
        eyebrow="Bennett students only"
        title={
          <>
            Create your <em className="text-gold">account</em>
          </>
        }
      >
        One account holds your bookings and passes. Bookings are for Bennett University students only.
      </PageTitle>
      <SignupForm next={next} whatsappUrl={EVENT_FACTS.whatsappGroupUrl} requireVerification={env().REQUIRE_EMAIL_VERIFICATION} />
    </>
  );
}
