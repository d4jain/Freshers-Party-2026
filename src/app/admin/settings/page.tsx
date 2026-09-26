import { saveSettings } from "@/app/admin/actions";
import { ActionForm } from "@/components/admin/action-form";
import { getDb } from "@/lib/db";
import { dateToIstLocal } from "@/lib/format";
import { getSettings } from "@/lib/settings";

const rupees = (paise: number | null) => (paise == null ? "" : (paise / 100).toFixed(paise % 100 === 0 ? 0 : 2));

function F({
  label,
  name,
  defaultValue,
  type = "text",
  hint,
  inputMode,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  hint?: string;
  inputMode?: "numeric" | "decimal" | "tel" | "email" | "url";
}) {
  return (
    <div>
      <label className="field-label" htmlFor={`s-${name}`}>
        {label}
      </label>
      <input id={`s-${name}`} name={name} type={type} inputMode={inputMode} defaultValue={defaultValue ?? ""} className="field" />
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

function T({
  label,
  name,
  defaultValue,
  rows = 8,
  hint,
}: {
  label: string;
  name: string;
  defaultValue: string | null;
  rows?: number;
  hint?: string;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={`s-${name}`}>
        {label}
      </label>
      <textarea id={`s-${name}`} name={name} rows={rows} defaultValue={defaultValue ?? ""} className="field font-mono text-sm" />
      {hint && <p className="field-hint break-all">{hint}</p>}
    </div>
  );
}

function Group({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <fieldset className="card space-y-4 p-5">
      <legend className="px-1 font-display text-2xl text-ivory">{title}</legend>
      {note && <p className="text-sm text-muted">{note}</p>}
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export default async function SettingsPage() {
  const s = await getSettings(getDb());
  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl text-ivory">Event settings</h1>
      <p className="max-w-3xl text-sm text-muted">
        The single source of truth for the public site and checkout. Leave unknown details blank — the site shows “to be
        announced” and hides unconfigured contacts. Price changes apply only to new bookings; every booking keeps its own
        snapshot. All changes are audited.
      </p>
      <ActionForm action={saveSettings} submitLabel="Save settings" className="space-y-6">
        <Group title="Event & timing" note="Times are Asia/Kolkata (IST). The countdown targets the start time once set.">
          <F label="Event name" name="eventName" defaultValue={s.eventName} />
          <div />
          <F
            label="Start time (IST)"
            name="startsAt"
            type="datetime-local"
            defaultValue={dateToIstLocal(s.startsAt)}
            hint="Blank = “Timing to be announced”."
          />
          <F label="End time (IST)" name="endsAt" type="datetime-local" defaultValue={dateToIstLocal(s.endsAt)} />
          <T
            label="Drinks details (shown publicly)"
            name="drinksDetails"
            defaultValue={s.drinksDetails}
            rows={3}
            hint="Only confirmed facts. Blank = “drinks menu not announced yet”."
          />
        </Group>

        <Group title="Venue">
          <F label="Address" name="venueAddress" defaultValue={s.venueAddress} />
          <F label="Venue website" name="venueWebsite" defaultValue={s.venueWebsite} inputMode="url" />
          <F
            label="Verified map pin URL"
            name="venueMapUrl"
            defaultValue={s.venueMapUrl}
            inputMode="url"
            hint="Only after checking the pin is the Advant Navis Park branch. Blank = labelled search link."
          />
        </Group>

        <Group title="Pricing & sales" note="Default: no customer surcharge.">
          <F label="Ticket price (₹ per person)" name="unitPrice" defaultValue={rupees(s.unitPricePaise)} inputMode="decimal" />
          <F
            label="Previous price for strike-through (₹)"
            name="compareAtPrice"
            defaultValue={rupees(s.compareAtPricePaise)}
            inputMode="decimal"
          />
          <F
            label="Booking fee per order (₹, optional)"
            name="bookingFee"
            defaultValue={rupees(s.bookingFeePaise)}
            inputMode="decimal"
          />
          <F label="Booking fee label" name="bookingFeeLabel" defaultValue={s.bookingFeeLabel} />
          <F
            label="Capacity (people)"
            name="capacity"
            defaultValue={s.capacity}
            inputMode="numeric"
            hint="Required for live sales."
          />
          <F label="Max people per booking" name="maxGroupSize" defaultValue={s.maxGroupSize} inputMode="numeric" />
          <F
            label="Hold time to pay + upload proof (minutes, 5–180)"
            name="holdMinutes"
            defaultValue={s.holdMinutes}
            inputMode="numeric"
          />
          <div />
          <F label="Sales open (IST)" name="salesOpenAt" type="datetime-local" defaultValue={dateToIstLocal(s.salesOpenAt)} />
          <F label="Sales close (IST)" name="salesCloseAt" type="datetime-local" defaultValue={dateToIstLocal(s.salesCloseAt)} />
          <F
            label="Offer expiry (IST, informational)"
            name="offerExpiresAt"
            type="datetime-local"
            defaultValue={dateToIstLocal(s.offerExpiresAt)}
          />
          <label className="flex items-center gap-3 self-end rounded-xl border border-gold/30 p-3 text-sm font-semibold text-ivory">
            <input type="checkbox" name="salesEnabled" defaultChecked={s.salesEnabled} className="h-5 w-5 accent-[#d7b777]" />
            Live sales enabled (needs capacity + approved policies)
          </label>
        </Group>

        <Group title="Organiser contact" note="Leave blank to hide. Never use the venue’s business number as the organiser’s.">
          <F label="Organiser name" name="organiserName" defaultValue={s.organiserName} />
          <F label="Phone" name="organiserPhone" defaultValue={s.organiserPhone} inputMode="tel" />
          <F label="WhatsApp number" name="organiserWhatsapp" defaultValue={s.organiserWhatsapp} inputMode="tel" />
          <F
            label="Email (also gets “proof submitted” alerts)"
            name="organiserEmail"
            defaultValue={s.organiserEmail}
            inputMode="email"
          />
          <F label="Instagram handle or URL" name="organiserInstagram" defaultValue={s.organiserInstagram} />
          <F label="WhatsApp group link" name="whatsappGroupUrl" defaultValue={s.whatsappGroupUrl} inputMode="url" />
        </Group>

        <Group
          title="UPI payments"
          note="Buyers pay this QR / UPI ID, then upload a screenshot and transaction ID for you to verify in Payment review."
        >
          <F
            label="UPI ID"
            name="upiId"
            defaultValue={s.upiId}
            hint="Shown at checkout and used for the “Pay in UPI app” button."
          />
          <F label="Payee name (as shown in UPI apps)" name="upiPayeeName" defaultValue={s.upiPayeeName} />
          <F
            label="Payment QR image"
            name="paymentQrPath"
            defaultValue={s.paymentQrPath}
            hint="A file in public/ (e.g. /media/payment/upi-qr.png) or an https:// URL."
          />
          <div className="flex items-end">
            {s.paymentQrPath && (
              // eslint-disable-next-line @next/next/no-img-element -- admin preview of a configurable path
              <img src={s.paymentQrPath} alt="Current payment QR" className="h-32 w-32 rounded-lg bg-white p-1" />
            )}
          </div>
        </Group>

        <fieldset className="card space-y-4 p-5">
          <legend className="px-1 font-display text-2xl text-ivory">Policies (policy v{s.policyVersion})</legend>
          <p className="text-sm text-muted">
            Paste organiser-approved text. Editing any policy bumps the version, so buyers accept the new text. Live sales stay
            closed until approved.
          </p>
          <T label="Event terms" name="termsText" defaultValue={s.termsText} />
          <T label="Privacy policy" name="privacyText" defaultValue={s.privacyText} />
          <T label="Cancellation & refund policy" name="refundPolicyText" defaultValue={s.refundPolicyText} />
          <label className="flex items-center gap-3 rounded-xl border border-gold/30 p-3 text-sm font-semibold text-ivory">
            <input
              type="checkbox"
              name="policiesApproved"
              defaultChecked={s.policiesApproved}
              className="h-5 w-5 accent-[#d7b777]"
            />
            These policies are organiser-approved and binding
          </label>
        </fieldset>

        <fieldset className="card space-y-4 p-5">
          <legend className="px-1 font-display text-2xl text-ivory">Approved media</legend>
          <p className="text-sm text-muted">
            Only media you have permission to use. Put files in <code>public/media/approved/</code> (or https URLs). Caption
            previous-event media honestly — never as footage of this party.
          </p>
          <T
            label="Gallery items (JSON array)"
            name="approvedMedia"
            defaultValue={JSON.stringify(s.approvedMedia, null, 2)}
            rows={10}
            hint='[{"id":"venue-1","kind":"venue","type":"image","src":"/media/approved/venue-1.jpg","alt":"…","caption":"Rubarru Advant Navis Park — photo supplied by the venue","credit":"Rubarru"}]'
          />
          <div className="grid gap-4 md:grid-cols-3">
            <F label="Hero video MP4 (muted loop)" name="heroVideoMp4" defaultValue={s.heroVideo?.mp4} />
            <F label="Hero video WebM" name="heroVideoWebm" defaultValue={s.heroVideo?.webm} />
            <F label="Hero video poster image" name="heroVideoPoster" defaultValue={s.heroVideo?.poster} />
          </div>
        </fieldset>
      </ActionForm>
    </div>
  );
}
