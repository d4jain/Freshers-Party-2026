/**
 * Runs one reconciliation pass from the command line (same code as
 * /api/cron/reconcile): expire stale holds, recover missed captures, retry
 * stored webhooks, send queued email.
 *   npm run reconcile:once
 */
import "./lib/load-env.mts";
import { runReconciliation } from "../src/lib/cron";
import { getDb } from "../src/lib/db";
import { getGateway } from "../src/lib/payments";

const summary = await runReconciliation(getDb(), getGateway(), process.env.APP_URL ?? "http://localhost:3000");
console.log(JSON.stringify(summary, null, 2));
process.exit(0);
