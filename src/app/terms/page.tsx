import type { Metadata } from "next";
import { PolicyPage, PolicyText } from "@/components/site/policy-page";
import { EVENT_FACTS } from "@/config/event";
import { getPublicEvent } from "@/lib/public-settings";

export const metadata: Metadata = { title: "Event terms & conditions" };
export const revalidate = 60;

export default async function TermsPage() {
  const { settings: s } = await getPublicEvent();
  return (
    <PolicyPage
      title="Event terms & conditions"
      eyebrow="Policies"
      approved={Boolean(s.termsText && s.policiesApproved)}
      version={s.policyVersion}
    >
      {s.termsText ? (
        <PolicyText text={s.termsText} />
      ) : (
        <div className="space-y-4 leading-relaxed text-mist">
          <p>The organisers haven’t published the event terms yet. For reference, this is how the booking system works today:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>{EVENT_FACTS.independentDisclosure}</li>
            <li>Only Bennett University students may attend. The booker confirms this for everyone in the booking.</li>
            <li>
              A booking is confirmed only after the organisers verify your UPI payment. Each paid place gets one QR pass, valid
              for one entry.
            </li>
            <li>Event timing, entry rules and any other conditions will be set by the organisers.</li>
          </ul>
        </div>
      )}
    </PolicyPage>
  );
}
