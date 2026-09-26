# Payments, holds and booking states

This document is the reference for how money, places and passes move. The code
lives in `src/lib/booking/*` and `src/lib/payments/*`; tests in
`tests/integration/{checkout,payments,checkin}.test.ts`.

## Principles

- **Server is the source of truth.** Price, discount, fees, eligibility
  acknowledgement versions, capacity and payment status are computed or
  verified on the server. Client-submitted totals are ignored.
- **All money is integer paise, currency INR.** ₹2,199 = `219900`.
- **Only a captured Razorpay payment for the booking's own order, for exactly
  the stored amount in INR, can confirm a booking.** Client callbacks and
  authorised-but-uncaptured payments never issue passes.
- **One confirmation service** (`applyPaymentUpdate`) handles the checkout
  callback, webhooks, reconciliation, demo simulation and organiser retries.
- **Exactly once.** Confirmation runs inside one transaction holding the
  inventory lock (`event_settings` row) and the booking row lock; passes have a
  unique `(booking_id, ticket_index)`; emails have a unique dedupe key.
- **Never silently discard a paid order.** Anything paid that can't be
  confirmed goes to `needs_review` plus an exception row.

## Flow

1. `POST /api/bookings` validates auth, same-origin, rate limit, input (Zod),
   verified email, sales window, group size and policy version.
2. In one transaction: lock inventory → idempotency lookup by
   `(user_id, idempotency_key)` → reuse or supersede the user's pending booking →
   lock coupon row and check usage limits → check capacity
   (`confirmed places + live holds`) → insert booking, hold and coupon
   reservation. **No network calls inside the transaction.**
3. After commit, create the Razorpay order for `total_paise` and store it with
   compare-and-set (`gateway_order_id IS NULL`). Retries reuse the same booking;
   a losing concurrent order is never returned to the browser.
4. The browser receives only: key id, order id, trusted amount, prefill,
   reference and hold expiry.
5. Bottle animation (~1 s, skipped for reduced motion) → Razorpay Checkout.
6. `POST /api/bookings/:id/verify`: ownership check → signature verified with
   **the order id from our DB** → payment fetched from Razorpay → confirmation
   service.
7. `POST /api/payments/razorpay/webhook`: HMAC over the raw body with the
   separate webhook secret → event stored by `x-razorpay-event-id` (dedupe) →
   confirmation service. Refund events re-fetch the payment for cumulative
   refund amounts.
8. `GET /api/bookings/:id` (polled by the booking page) occasionally re-fetches
   the order's payments from Razorpay, so a missed webhook or closed tab still
   resolves.
9. `GET /api/cron/reconcile` (scheduled) expires stale holds, recovers missed
   captures, retries stored webhooks and sends queued email.

## Booking states (`bookings.status`)

| From | To | Trigger |
|---|---|---|
| — | `pending_payment` | Checkout created; places + coupon use held |
| `pending_payment` | `confirmed` | Captured payment, hold live (or capacity rechecked) |
| `pending_payment` | `expired` | Hold passed with no captured payment (server time), or superseded by a newer request |
| `pending_payment` / `expired` | `needs_review` | Captured but amount/currency mismatch, or late capture with no places left, or partial refund before confirmation |
| `expired` | `confirmed` | Late capture and capacity still available (rechecked under lock) |
| `needs_review` | `confirmed` | Organiser “Retry confirmation” (capacity rechecked; needs captured payment) |
| `needs_review` / `confirmed` | `refunded` | Full refund synced from Razorpay (passes voided) |

Never: `confirmed → expired/pending`, and failure events never change booking
state. There is no admin action that marks a booking as paid.

## Payment attempt states (`payment_attempts.status`)

Monotonic merge, so late or duplicate events can't downgrade:
`created < failed < authorized < captured < partially_refunded < refunded`.
A second captured payment on a confirmed booking is flagged
`is_extra_capture` and raises an `extra_capture` exception (refund it in
Razorpay; the refund webhook auto-resolves the exception).

## Holds (`inventory_holds.status`)

`active → consumed` (confirmed) or `active → released` (expired, superseded,
needs review, refunded). A hold counts toward capacity only while
`status = 'active' AND expires_at > now()` (database time), so capacity is
never “released twice” — it's computed, not decremented. Pending bookings with
an **authorised** payment get a 30-minute grace before expiry.

## Coupon reservations

`held → committed` on confirmation; `held → released` when the booking expires.
Limits (`max_redemptions`, `per_user_limit`) count committed + live held
reservations under the coupon row lock. A late capture after release honours
the discounted price the customer already paid and flags `coupon_over_limit`
if it now exceeds the limit.

## Exceptions queue (`booking_exceptions`)

`capacity_unavailable_after_capture`, `amount_mismatch`, `extra_capture`,
`partial_refund`, `coupon_over_limit`, `capture_on_refunded_booking`,
`unknown_order`. Organisers resolve them in **Admin → Exceptions** after acting
in the Razorpay Dashboard; each resolution needs a note and is audited.

## Refunds

Refunds are made **manually in the Razorpay Dashboard** (no local “refund”
button). Subscribe the webhook to `refund.created`, `refund.processed`,
`refund.failed`: the app re-fetches the payment and
- full refund → booking `refunded`, all passes void, rejected at the door;
- partial refund → `partial_refund` exception; void the right pass(es) from the
  booking page (audited).

## Capture settings

The app never captures payments itself. Keep **automatic capture** on in the
Razorpay Dashboard (Account & Settings → Payment capture). Authorised payments
are shown as “Payment received; confirming your booking” and resolved by the
webhook/reconciler once captured.

## Demo mode

Only when `DEMO_MODE=true`, no Razorpay keys, and not production. A dashed
“DEMO checkout” dialog simulates capture/failure through the real
confirmation service. Demo bookings/passes are flagged, labelled “DEMO”, and
rejected at the door unless the check-in server itself is in demo mode.
