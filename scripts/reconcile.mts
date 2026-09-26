/**
 * Runs one housekeeping pass from the command line (same code as
 * /api/cron/reconcile): expire unpaid holds, send queued email.
 *   npm run reconcile:once
 */
import "./lib/load-env.mts";
import { runReconciliation } from "../src/lib/cron";
import { getDb } from "../src/lib/db";

const summary = await runReconciliation(getDb(), process.env.APP_URL ?? "http://localhost:3000");
console.log(JSON.stringify(summary, null, 2));
process.exit(0);
