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
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` | `resend` + verified domain | same or `none` |
| `DEMO_MODE` | unset | optional |

Generate secrets with `openssl rand -base64 32`.

### Platform limits to know

- **Plan:** Vercel's Hobby plan is for personal, non-commercial use; selling
  tickets is commercial, so check Vercel's fair-use terms — the Pro plan may
  be required.
- **Request bodies are capped at 4.5 MB.** Payment screenshots are limited to
  4 MB on the server, and the browser re-encodes anything over 3 MB before
  uploading.
- **Proof images live in Postgres** (≈100–400 KB each after re-encoding), so
  a few thousand bookings fit comfortably in Neon's free storage.

## 3. Admin accounts

The organiser signs up on the site (and verifies their email, unless
`REQUIRE_EMAIL_VERIFICATION=false`), then someone with database access runs:

```bash
DATABASE_URL_UNPOOLED="…" npm run admin:grant -- --email organiser@example.com --role admin
DATABASE_URL_UNPOOLED="…" npm run admin:grant -- --email volunteer@example.com --role staff
```

No default admin or password exists anywhere in the code.

## 4. UPI payments

No gateway or keys. In **Admin → Settings → UPI payments** confirm the UPI ID,
payee name and QR image (`public/media/payment/upi-qr.png` by default), and set
the **organiser email** to receive “proof submitted” alerts. Organisers then
work the **Admin → Payment review** queue, matching amount + transaction ID in
their UPI app before approving.

## 5. Scheduler

`/api/cron/reconcile` (expires unpaid holds, sends queued email) must be called regularly with
`Authorization: Bearer $CRON_SECRET`.

- **Vercel Hobby:** crons may run at most **once per day** (more frequent
  schedules fail deployment). `vercel.json` ships a daily run (21:30 UTC ≈ 03:00 IST).
  For frequent runs, set the GitHub repository secrets `RECONCILE_URL` and
  `CRON_SECRET` to enable `.github/workflows/reconcile.yml` (every 10 minutes;
  GitHub may delay runs), or use any external scheduler.
- **Vercel Pro:** change the schedule in `vercel.json` to `*/5 * * * *`.

The job is idempotent and safe to run concurrently. Holds are also enforced
directly by database time, so a late scheduler never oversells.

## 6. Email (Resend)

Verify a sending domain in Resend, set `EMAIL_PROVIDER=resend`,
`RESEND_API_KEY`, `EMAIL_FROM`. Confirmation emails go through the outbox with
idempotency keys; failures retry with backoff and never affect bookings.

## 7. Before enabling live sales (Admin → Settings)

- Capacity, sales window, end time (IST); check the seeded start time and contacts
- Terms and **refund** policy text present and marked approved (seeded from `src/config/policies.ts`)
- Verified map pin (optional) and approved venue media (optional)
- Then tick **Live sales enabled**.
