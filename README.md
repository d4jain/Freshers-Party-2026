# Freshers’ Party 2026

Website, booking and door check-in for **Freshers’ Party 2026** — an
unofficial, independently organised party for **first-year Bennett University
students** on **Thursday, 1 October 2026** at **Rubarru, Advant Navis Park,
Noida**. ₹2,199 per person (was ₹2,500), same price for everyone. Unlimited
Food + Unlimited Drinks · Party | Dance | Games.

Students discover the party, create an account, book for themselves or a group,
pay by UPI and upload proof, and get one QR pass per person once an organiser verifies the payment. Organisers get a protected
dashboard for bookings, exceptions, coupons, referrals, settings, CSV export and
an audit trail; door staff get a camera + manual-code check-in page.

> Status: **not deployed.** Payments are manual UPI (no gateway). See “Missing launch inputs”.

---

## Quick start (local)

Requirements: Node 22.12+ (tested on Node 26.7), npm, Google Chrome (for the browser tests).
No Docker or system Postgres needed — a real PostgreSQL 18 runs from the
`embedded-postgres` dev dependency.

```bash
npm install
cp .env.example .env.local          # defaults: local DB, DEMO_MODE=true, console email

npm run db:local                    # terminal 1 — keeps a local Postgres running on :54329
npm run db:migrate                  # terminal 2
npm run db:seed -- --demo           # settings row + labelled demo coupon DEMO10 / referral DEMO-CAMPAIGN
npm run dev                         # http://localhost:3000
```

Then:

1. Sign up at `/signup`. The verification link is printed in the dev-server
   console (console email provider) — open it to verify.
2. Book at `/book` → you land on the payment page with the UPI QR and exact
   amount → upload any screenshot + a 12-digit transaction ID → booking shows
   **In review**. In DEMO mode bookings/passes say **DEMO** and are rejected at
   the door in non-demo environments.
3. Make yourself an organiser: `npm run admin:grant -- --email you@example.com --role admin`
   (then log in again) → `/admin/review` to approve it → passes appear.
   Door staff: `--role staff` → `/staff/check-in`.

In DEMO mode an unset capacity falls back to a labelled demo capacity of 150;
live sales stay closed until capacity and approved policies are configured.

> Port note for this machine: another, unrelated app is listening on
> `127.0.0.1:3000`. If `localhost:3000` shows a different site, run
> `npm run dev -- --port 3100` and set `APP_URL=http://localhost:3100` in `.env.local`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / serve build |
| `npm run lint` · `typecheck` · `format` · `format:check` | ESLint · `tsc --noEmit` · Prettier |
| `npm test` | Unit + integration tests (Vitest) against a throwaway real Postgres |
| `npm run test:e2e` | Playwright (system Chrome, 360 px + 1440 px) against a dev server on :3210 in DEMO mode; needs `npm run db:local` running |
| `npm run verify` | lint + typecheck + tests + build |
| `npm run db:local` | Local PostgreSQL 18 in `.data/postgres` |
| `npm run db:generate` | Generate a migration after editing `src/lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations (uses `DATABASE_URL_UNPOOLED` if set) |
| `npm run db:seed [-- --demo]` | Create the settings row; `--demo` adds labelled fixtures (refused in production) |
| `npm run admin:grant -- --email … --role admin\|staff\|user` | The only way to assign roles; signs the user out everywhere; audited |
| `npm run reconcile:once` | One reconciliation pass from the CLI (same as the cron endpoint) |
| `npm run omniroute:check` | OmniRoute local diagnostics (dev tooling only) |

## Configuration

All variables are documented in [`.env.example`](.env.example). Event facts
that organisers can change (start/end time, capacity, sales window, price,
contacts, map pin, drinks details, policies, approved media, hero video) live in
the database and are edited in **Admin → Settings**; nothing unconfirmed is
invented — the site shows “Timing to be announced”, hides unconfigured contact
buttons, and uses a labelled Google Maps *search* link until a pin is verified.

## How payments work

Short version (full state table in [`docs/PAYMENTS.md`](docs/PAYMENTS.md)):

1. Server validates everything and **atomically holds the places** (and any
   coupon use) for 30 minutes — idempotent per checkout attempt.
2. Bottle-pop animation (~1 s, skipped for reduced motion) → payment page with the
   organiser's **UPI QR**, exact amount, payee name, UPI ID and the booking
   reference to add as the note (plus a `upi://` button on phones).
3. Buyer uploads the **payment screenshot + UPI transaction ID (UTR)** → booking
   is **In review** under My bookings; places stay reserved.
4. Organiser checks their UPI app in **Admin → Payment review** and **approves**
   (confirmed, QR passes issued, email sent) or **rejects** with a reason
   (places released). Duplicate UTRs/screenshots are flagged or refused.
5. Refunds happen outside the site; the organiser then cancels the booking
   (passes void).

Scheduler, email and deployment: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
Architecture and security model: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Tests

| Suite | What it covers | Kind |
|---|---|---|
| `tests/unit` (26) | Pricing & coupons (paise, caps, expiry, min rules, no zero totals), validation (phone, email, quantities, acknowledgements, tampered fields ignored, referral vs coupon), signatures, QR tokens, cron auth | Unit |
| `tests/integration/checkout` (14) | Idempotent duplicate clicks, supersede, price-change snapshot, sales window/group size/policy version/email verification, **concurrent last places**, hold expiry without double release, **final coupon redemption race**, per-user limits, referral attribution & self-referral | Real Postgres |
| `tests/integration/review` (17) | Proof upload → in review (image re-encoded, places kept), organiser alert email, invalid UTR / non-image / oversize, cross-user upload blocked, **duplicate UTR refused** (allowed again after rejection), late proof only if places remain, approval issues passes **exactly once under concurrent approvals**, no approval without proof, rejection releases places + coupon, cancellation voids passes, unpaid holds expire, email outbox retry, UPI link/UTR helpers | Real Postgres |
| `tests/integration/checkin` (5) | QR/manual lookup, forged codes, **concurrent repeat check-in** (exactly one admit), void and demo passes | Real Postgres |
| `tests/integration/auth-and-routes` (9) | Signup/login via Better Auth, duplicate email, invalid phone/referral, role not self-assignable, **expired reset token**, protected routes (401), CSRF (403), **cross-user booking access (404)**, forged callback rejected, staff route forbidden | Real Postgres + route handlers |
| `tests/e2e` (Playwright, 10 specs × 2 viewports) | Landing facts & honest placeholders, no overflow (360/1440 and every signed-in page), keyboard FAQ, countdown, gallery failure fallback, venue search link, reduced motion, cursor glitter toggle, **full journey** (draft kept through signup → UPI payment page → proof upload → In review → organiser approves → passes → staff admit → “Already checked in”), admin access control | Browser, DEMO mode |

Not automatable: whether a screenshot reflects a real payment — that's the
organiser's check in their UPI app. Everything around it (state changes,
duplicates, capacity, passes) is tested against a real Postgres.

## Tooling status

| Tool | Resolved source / version | Where used | Status |
|---|---|---|---|
| Motion Primitives | motion-primitives.com, CLI `motion-primitives@0.1.0` (+ `motion@13.4.4`) | Hero TextEffect, AnimatedGroup (experience), InView reveals, Accordion (FAQ), TransitionPanel (booking steps), Carousel (gallery), SlidingNumber (countdown) — adapted for a11y/reduced motion | **Working** |
| Haikei | haikei.app (web app; ToS forbids automated access) | Section waves, aura blobs, gold scatter | **Awaiting exports** — temporary hand-made SVGs (not Haikei), spec in `public/media/decor/HAIKEI_EXPORTS.md` |
| TasteSkill | Not installed; no source supplied (likely `Leonxlnx/taste-skill`, unconfirmed) | — | **Unavailable** — not applied |
| WebDesign Guidelines | Not installed; no source supplied (likely `vercel-labs/agent-skills` → `web-design-guidelines`, unconfirmed) | — | **Unavailable** — not applied |
| Awesome Design | Not installed; ambiguous (several “awesome design” repos) | — | **Unavailable** — not applied |
| OmniRoute | Global npm `omniroute@3.8.50` (github.com/diegosouzapw/OmniRoute); gateway + MCP server, not a native plugin | `.mcp.json` registers its MCP endpoint (`localhost:20128/api/mcp/stream`) for Claude Code; website runtime does not depend on it | **Awaiting setup** — doctor OK, server offline; connectivity check not passed |

Details: [`docs/DEV_TOOLING.md`](docs/DEV_TOOLING.md). Asset sources and licences:
[`docs/ASSET_CREDITS.md`](docs/ASSET_CREDITS.md).

## Missing launch inputs (organiser decisions / secrets)

- **Event start/end time**, **capacity**, **sales open/close**, offer expiry (if any)
- **Organiser name and contact** (phone/WhatsApp/email/Instagram)
- **Event terms, privacy policy and cancellation/refund policy** (organiser-approved text)
- **Drinks details** (currently “menu not announced”; no alcohol is promised)
- **Verified map pin** for the Advant Navis Park branch
- **The event poster** (not found in the project) and any **approved venue/previous-event media**; optional hero video
- **Haikei SVG exports** (see decor spec)
- Secrets: Neon URLs, `BETTER_AUTH_SECRET`, `TICKET_SIGNING_SECRET`, `CRON_SECRET`,
  Resend key + verified sender domain
- Confirm the **UPI QR / ID** (currently the supplied QR: ABHIRAKSHIT GAUR, `63968583011@axl`) and set an
  **organiser email** to get “proof submitted” alerts
