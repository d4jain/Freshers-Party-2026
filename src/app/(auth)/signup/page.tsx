import type { Metadata } from "next";
import { PageTitle } from "@/components/site/page-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { EVENT_FACTS } from "@/config/event";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function SignupPage(props: PageProps<"/signup">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : null;
  return (
    <>
      <PageTitle
        eyebrow="First-years only"
        title={
          <>
            Create your <em className="text-gold">account</em>
          </>
        }
      >
        One account holds your bookings and passes. Bookings are for first-year Bennett University students only.
      </PageTitle>
      <SignupForm next={next} whatsappUrl={EVENT_FACTS.whatsappGroupUrl} />
    </>
  );
}
