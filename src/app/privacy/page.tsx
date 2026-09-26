import type { Metadata } from "next";
import { PolicyPage, PolicyText } from "@/components/site/policy-page";
import { getPublicEvent } from "@/lib/public-settings";

export const metadata: Metadata = { title: "Privacy policy" };
export const revalidate = 60;

export default async function PrivacyPage() {
  const { settings: s } = await getPublicEvent();
  return (
    <PolicyPage
      title="Privacy policy"
      eyebrow="Policies"
      approved={Boolean(s.privacyText && s.policiesApproved)}
      version={s.policyVersion}
    >
      {s.privacyText ? (
        <PolicyText text={s.privacyText} />
      ) : (
        <div className="space-y-4 leading-relaxed text-mist">
          <p>
            The organisers haven’t published their privacy policy yet. For transparency, this is what the website currently
            collects and why:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-ivory">Account:</strong> name, Indian mobile number, email and a securely hashed password —
              to run your account and bookings.
            </li>
            <li>
              <strong className="text-ivory">Bookings:</strong> number of people (girls/boys), booker contact details,
              coupon/referral codes and your confirmations — to issue passes and manage entry.
            </li>
            <li>
              <strong className="text-ivory">Payments:</strong> you pay the organisers directly by UPI. We store the payment
              screenshot you upload (metadata stripped), the transaction ID and the amount so organisers can verify it — never UPI
              PINs or bank credentials. Screenshots are visible only to you and the organisers.
            </li>
            <li>
              <strong className="text-ivory">Security:</strong> an HTTP-only session cookie keeps you signed in; IP addresses are
              used briefly for rate limiting.
            </li>
            <li>
              <strong className="text-ivory">Email:</strong> booking and account emails are sent through an email provider.
              Marketing emails only if you opted in.
            </li>
            <li>Retention periods and the organiser’s contact for privacy requests are still to be published.</li>
          </ul>
        </div>
      )}
    </PolicyPage>
  );
}
