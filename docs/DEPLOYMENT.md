# Deployment (Vercel + Neon)

> Nothing has been deployed. Don't deploy publicly or enable real charges
> without the organisers' explicit go-ahead.

## 1. Neon

1. Create a project (region close to India, e.g. AWS ap-southeast-1 / ap-south-1).
2. Copy two connection strings from **Connect**:
   - **Pooled** (host contains `-pooler`) → `DATABASE_URL` (app runtime).
   - **Direct** → `DATABASE_URL_UNPOOLED` (migrations only).
3. Apply migrations and seed from your machine:
   ```bash
   DATABASE_URL_UNPOOLED="postgres://…direct…" npm run db:migrate
   DATABASE_URL_UNPOOLED="postgres://…direct…" npm run db:seed
   ```
   (Never run `db:seed -- --demo` against production — it refuses anyway.)

## 2. Vercel project

Import the repo (framework: Next.js; Node 22+). Set environment variables for
**Production** and **Preview** separately (see `.env.example`):

| Variable | Production | Preview |
|---|---|---|
| `APP_URL` | `https://your-domain` | preview URL / staging domain |
| `APP_ENV` | `production` | `preview` |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Neon main branch | a Neon *branch* |
| `BETTER_AUTH_SECRET`, `TICKET_SIGNING_SECRET`, `CRON_SECRET` | strong random values | different random values |
| `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` | **test keys first** | test keys |
| `ALLOW_LIVE_PAYMENTS` | `false` until go-live | `false` |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` | `resend` + verified domain | same or `none` |
| `DEMO_MODE` | unset | optional (`true` only without Razorpay keys) |

Generate secrets with `openssl rand -base64 32`.

## 3. Admin accounts

The organiser signs up on the site and verifies their email, then someone with
database access runs:

```bash
DATABASE_URL_UNPOOLED="…" npm run admin:grant -- --email organiser@example.com --role admin
DATABASE_URL_UNPOOLED="…" npm run admin:grant -- --email volunteer@example.com --role staff
```

No default admin or password exists anywhere in the code.

## 4. Razorpay (test mode first)

1. Dashboard → switch to **Test Mode** → Account & Settings → API Keys → generate.
2. Payment capture: keep **automatic capture** enabled.
3. Webhooks → Add: URL `https://your-domain/api/payments/razorpay/webhook`,
   secret = `RAZORPAY_WEBHOOK_SECRET`, events: `payment.authorized`,
   `payment.captured`, `payment.failed`, `order.paid`, `refund.created`,
   `refund.processed`, `refund.failed`.
4. Test with Razorpay's test cards / test UPI IDs from their docs. Verify:
   booking confirms, passes appear, email arrives; a dismissed checkout can be
   resumed; a refund from the Dashboard voids the passes.

## 5. Scheduler

`/api/cron/reconcile` must be called regularly with
`Authorization: Bearer $CRON_SECRET`.

- **Vercel Hobby:** crons may run at most **once per day** (more frequent
  schedules fail deployment). `vercel.json` ships a daily run (21:30 UTC ≈ 03:00 IST).
  For frequent runs, set the GitHub repository secrets `RECONCILE_URL` and
  `CRON_SECRET` to enable `.github/workflows/reconcile.yml` (every 10 minutes;
  GitHub may delay runs), or use any external scheduler.
- **Vercel Pro:** change the schedule in `vercel.json` to `*/5 * * * *`.

The job is idempotent and safe to run concurrently. Holds are also enforced
directly by database time, and the booking page re-checks Razorpay on its own,
so a late scheduler never oversells.

## 6. Email (Resend)

Verify a sending domain in Resend, set `EMAIL_PROVIDER=resend`,
`RESEND_API_KEY`, `EMAIL_FROM`. Confirmation emails go through the outbox with
idempotency keys; failures retry with backoff and never affect bookings.

## 7. Before enabling live sales (Admin → Settings)

- Capacity, sales window, start/end time (IST), organiser contact(s)
- Terms, privacy and **refund** policy text pasted and marked approved
- Verified map pin (optional) and approved venue media (optional)
- Then tick **Live sales enabled**.

## 8. Switching Razorpay from test to live

Razorpay live mode requires a KYC-activated account (Razorpay says activation
typically takes a few business days after KYC) and a website with accurate
policy/contact pages. Once activated **and the organisers approve**:

1. Generate **live** keys; create a **live** webhook with a new secret.
2. Set `RAZORPAY_KEY_ID=rzp_live_…`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
3. Set `ALLOW_LIVE_PAYMENTS=true` (without it, live keys are refused).
4. Redeploy, make one small real booking, refund it from the Dashboard, and
   confirm the refund syncs (passes void).

The admin header shows `Razorpay TEST` / `Razorpay LIVE` / `DEMO MODE` so the
current mode is always visible.
