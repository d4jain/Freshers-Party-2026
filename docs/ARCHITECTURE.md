# Architecture

## Stack (pinned in `package.json`, lockfile committed)

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js App Router (Turbopack), React | 16.3.6 / 19.2.8 |
| Language | TypeScript (strict, `noUncheckedIndexedAccess`) | 5.9.3 |
| Styling | Tailwind CSS v4 (CSS-first tokens in `src/app/globals.css`) | 4.3.3 |
| Motion | Motion for React + Motion Primitives (copied, adapted) | 13.4.4 / CLI 0.1.0 |
| Database | PostgreSQL (Neon in production; `embedded-postgres` locally/tests) | PG 18 |
| ORM / migrations | Drizzle ORM + drizzle-kit, `pg` driver | 0.45.3 / 0.31.11 |
| Auth | Better Auth (email/password, database sessions, DB rate-limit store) | 1.7.6 |
| Payments | Razorpay Standard Checkout + Orders/Payments API (`razorpay` SDK) | 2.9.8 |
| Validation | Zod | 4.6.5 |
| Primitives | Radix UI (dialogs), Lucide icons | 1.6.7 / 1.48.0 |
| QR | `qrcode` (generate), native `BarcodeDetector` → `jsqr` fallback (scan) | 1.5.4 / 1.4.0 |
| Tests | Vitest (unit + integration on real Postgres), Playwright (system Chrome) | 5.0.2 / 1.63.0 |

TypeScript 7 (the native port) exists but was not adopted; Next 16's
type-check pipeline is verified with the TS 5.x API.

## Layout

```
src/
  app/                    routes (App Router)
    page.tsx              landing page (ISR 60s; falls back to confirmed facts if DB is down)
    (auth)/…              signup, login, forgot/reset password, verify email
    book/                 booking flow (3 steps)
    account/              dashboard, booking status + passes
    admin/                organiser dashboard (+ server actions in actions.ts, CSV export)
    staff/check-in/       door scanner
    api/                  route handlers (auth, bookings, verify, webhook, cron, staff, pass PNG)
  components/             UI (site/, booking/, account/, admin/, staff/, effects/, motion-primitives/)
  config/                 confirmed event facts + seed defaults, stock media registry
  lib/
    db/                   Drizzle schema + pooled client
    booking/              checkout (reserve), confirm (single confirmation service), reconcile, status
    payments/             gateway interface, Razorpay + demo gateways, signatures, webhook handling
    tickets/              QR token signing, check-in
    email/                providers, templates, outbox worker
    auth/                 Better Auth config, session helpers, client
    pricing.ts            pure price computation (client preview + server authority)
    settings.ts           single authoritative settings row + sales window + capacity math
drizzle/                  SQL migrations (generated)
scripts/                  local Postgres, migrate, seed, role provisioning, reconcile
tests/                    unit, integration (real Postgres), e2e (Playwright)
```

## Single sources of truth

- **Event settings & pricing:** the `event_settings` row (`id = 'main'`),
  edited only in Admin → Settings (audited). `src/config/event.ts` only seeds
  it and provides a read-only fallback for public pages.
- **Price of a booking:** its immutable `pricing_snapshot` + amount columns,
  guarded by CHECK constraints (`subtotal = unit × qty`, `total = subtotal − discount + fees`,
  `total ≥ 100 paise`, currency `INR`).
- **Payment truth:** Razorpay (fetched server-side), merged monotonically into
  `payment_attempts`.

## Data model (see `src/lib/db/schema.ts`)

`user`, `session`, `account`, `verification`, `rate_limit` (Better Auth) ·
`event_settings` · `referral_codes` · `coupons` · `bookings` · `booking_events`
(state log) · `inventory_holds` · `coupon_reservations` · `payment_attempts` ·
`webhook_events` · `booking_exceptions` · `tickets` · `check_in_events` ·
`email_outbox` · `audit_events` · `app_rate_limits`.

Key constraints: unique gateway order/payment ids, `(user_id, idempotency_key)`
unique, one `pending_payment` booking per user (partial unique index), unique
`(booking_id, ticket_index)`, unique ticket `public_id` and `manual_code`,
unique webhook `(provider, event_id)`, unique email `dedupe_key`, non-negative
amount/count checks, coupon/referral code format checks.

All timestamps are `timestamptz` (UTC); the UI formats them in Asia/Kolkata.

## Security model

- **Sessions:** Better Auth database sessions; HTTP-only, `SameSite=Lax`,
  `Secure` on HTTPS. Passwords hashed by Better Auth (scrypt). Nothing auth-related
  in localStorage.
- **Roles:** `user | staff | admin` stored on the user; `input: false` in Better
  Auth so signup/update can't set them; assigned only by
  `npm run admin:grant` (which also signs the user out everywhere).
- **Authorisation:** every admin page/server action and staff API re-checks the
  role server-side; every user resource query is scoped by `user_id`
  (other users' bookings return 404).
- **CSRF:** cookie-authenticated JSON APIs require a same-origin `Origin`
  (or `Sec-Fetch-Site`); server actions use Next's built-in origin check;
  Better Auth checks `trustedOrigins`. Webhooks use HMAC; cron uses a bearer secret.
- **CORS:** no CORS headers are emitted, so browsers block cross-origin reads.
- **Rate limits:** Better Auth's DB store for auth endpoints (sign-in 5/min,
  sign-up 5/10 min, reset 3/15 min per IP) and a Postgres fixed-window limiter for
  checkout, preview, verify and check-in. Both are shared across serverless instances.
- **CSP & headers:** see `next.config.ts` (Razorpay domains allowed for
  script/frame/connect; `frame-ancestors 'none'`; HSTS in production).
- **Secrets & PII:** never returned to the browser or written to logs; the
  audit log scrubs keys that look like secrets; CSV export excludes
  passwords, sessions, tokens and QR data and escapes spreadsheet formulas.
- **QR passes:** random 128-bit id + HMAC signature; no personal data.
  Manual codes are 50-bit random. Redemption is an atomic `UPDATE … WHERE
  checked_in_at IS NULL` behind staff auth and an explicit POST.

## Motion & performance

- Public pages render full HTML server-side; a `<noscript>` rule reveals any
  content that would fade in. Hero image is `priority`; gallery images lazy-load.
- Cursor glitter: one canvas, 90-particle pool, rAF only while particles live,
  paused when hidden; lazy-loaded only for fine pointers with effects on.
- Reduced motion: hydration-safe `usePrefersReducedMotion`, `MotionConfig
  reducedMotion="user"`, CSS kill-switch for animations, static hero, no glitter,
  checkout opens without the bottle animation.
- Hero video slot: muted/inline/looping, configured in settings; skipped for
  reduced motion and Save-Data; visible pause control.
