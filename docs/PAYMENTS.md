# Payments: manual UPI with organiser review

There is **no payment gateway**. Buyers pay the organiser's UPI QR, upload a
screenshot and the UPI transaction ID, and an organiser approves the booking
after finding the payment in their UPI account. Only an approval confirms a
booking and issues passes.

Code: `src/lib/booking/{checkout,payment-proof,review,reconcile,status}.ts`,
`src/lib/payments/upi.ts`. Tests: `tests/integration/{checkout,review,checkin}.test.ts`.

## Flow

1. **Book** (`POST /api/bookings`) — the server validates everything
   (auth, same-origin, rate limit, quantities, acknowledgements, sales window,
   group size, policy version, coupon/referral), recomputes the price, and in one
   transaction **holds the places** (and a coupon use) for `hold_minutes`
   (default 30). Idempotent per checkout attempt; one pending booking per user.
2. **Pay** — the booking page shows the QR (`paymentQrPath`), the exact amount,
   payee name, UPI ID and the booking reference to add as the note. On phones a
   `upi://pay` button pre-fills the amount and reference.
3. **Upload proof** (`POST /api/bookings/:id/proof`, multipart) — screenshot
   (≤ 8 MB, must decode as an image; re-encoded to JPEG with metadata stripped)
   + UTR (6–35 letters/digits) + optional payer name. The booking becomes
   **`in_review`** and its places stay reserved until an organiser decides.
   A transaction ID already used on another non-rejected booking is refused.
   Proof for a lapsed hold is accepted only if places are still available.
4. **Review** (Admin → Payment review) — the organiser sees the screenshot,
   amount due, UTR, booker, and warnings if the same UTR or the exact same
   screenshot appears on another booking. They tick “I found this payment”
   and **Approve** (→ `confirmed`, passes issued, email queued) or **Reject**
   with a reason shown to the buyer (→ `rejected`, places and coupon released).
5. **Cancel** (booking page, confirmed only) — after refunding via UPI
   yourself, cancel with a reason: all passes are voided at the door.

Housekeeping (`/api/cron/reconcile`, or `npm run reconcile:once`): expires
`pending_payment` bookings whose hold passed without proof (database time)
and sends queued email.

## Booking states

| From | To | Trigger |
|---|---|---|
| — | `pending_payment` | Booking created; places + coupon held for the hold time |
| `pending_payment` | `in_review` | Buyer uploads proof |
| `pending_payment` | `expired` | Hold passed with no proof, or superseded by a newer booking |
| `expired` | `in_review` | Late proof, only if places are still free |
| `in_review` | `confirmed` | Organiser approves (passes created once, email sent) |
| `in_review` / `pending_payment` | `rejected` | Organiser rejects with a reason |
| `confirmed` | `cancelled` | Organiser cancels (e.g. after a manual refund); passes void |

Guarantees: approval runs under the inventory lock and the booking row lock;
concurrent approvals produce exactly one set of passes (unique
`(booking_id, ticket_index)`); there is no path that confirms a booking
without proof and an organiser decision; every approve/reject/cancel is in
the audit log.

## Emails (outbox, retried with backoff)

`proof_submitted_admin` (to the organiser email, if set) · `booking_confirmation`
· `booking_rejected` · `booking_cancelled`. A message whose booking state has
since changed is dropped rather than sent.

## Limits of manual verification

- The organiser must actually check each payment in the UPI app — the site
  can't verify screenshots. Match **amount + UTR** (and the note, if present).
- Refunds are done by the organiser outside the site; then cancel the booking.
- Demo mode (`DEMO_MODE=true`, never in production) only relaxes the
  capacity/policy gate; payments are still manual. Demo passes are rejected at
  the door in non-demo environments.
