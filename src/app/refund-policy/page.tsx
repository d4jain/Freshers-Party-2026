import type { Metadata } from "next";
import { PolicyPage, PolicyText } from "@/components/site/policy-page";
import { getPublicEvent } from "@/lib/public-settings";

export const metadata: Metadata = { title: "Cancellation & refund policy" };
export const revalidate = 60;

export default async function RefundPolicyPage() {
  const { settings: s } = await getPublicEvent();
  return (
    <PolicyPage
      title="Cancellation & refund policy"
      eyebrow="Policies"
      approved={Boolean(s.refundPolicyText && s.policiesApproved)}
      version={s.policyVersion}
    >
      {s.refundPolicyText ? (
        <PolicyText text={s.refundPolicyText} />
      ) : (
        <p className="leading-relaxed text-mist">
          No cancellation or refund policy has been published yet. Online bookings stay closed until the organisers publish one,
          so you’ll always be able to read it before paying.
        </p>
      )}
    </PolicyPage>
  );
}
