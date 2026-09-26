/**
 * Seeds the event settings row from src/config/event.ts. On an existing row
 * it only fills columns that are still empty — it never overwrites a value
 * an organiser has set in Admin → Settings. With --demo, also adds clearly labelled demo coupon and
 * referral fixtures for local testing. Refuses --demo in production.
 *   npm run db:seed
 *   npm run db:seed -- --demo
 */
import { scriptDatabaseUrl } from "./lib/load-env.mts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { coupons, eventSettings, referralCodes, schema } from "../src/lib/db/schema";
import { defaultSettingsValues, getSettings } from "../src/lib/settings";

const url = scriptDatabaseUrl();
const demo = process.argv.includes("--demo");
const isProd = process.env.APP_ENV === "production" || process.env.VERCEL_ENV === "production";
if (demo && isProd) {
  console.error("Refusing to create demo fixtures in production.");
  process.exit(1);
}

const pool = new Pool({ connectionString: url, max: 1 });
const db = drizzle(pool, { schema });
let settings = await getSettings(db);

const defaults = defaultSettingsValues();
const fill: Partial<typeof eventSettings.$inferInsert> = {};
for (const [key, value] of Object.entries(defaults) as [keyof typeof defaults, unknown][]) {
  if (key !== "id" && settings[key] == null && value != null) Object.assign(fill, { [key]: value });
}
// The organiser supplied final policy text; approve it only if this run is what added it.
if (fill.termsText && fill.refundPolicyText && !settings.policiesApproved) fill.policiesApproved = true;
if (Object.keys(fill).length) {
  const [updated] = await db
    .update(eventSettings)
    .set({ ...fill, version: settings.version + 1, updatedBy: "seed" })
    .where(eq(eventSettings.id, "main"))
    .returning();
  settings = updated!;
  console.log(`Filled empty settings: ${Object.keys(fill).join(", ")}.`);
}
console.log(`Event settings ready (version ${settings.version}). Price: ${settings.unitPricePaise} paise.`);

if (demo) {
  await db
    .insert(coupons)
    .values({
      code: "DEMO10",
      description: "DEMO FIXTURE — 10% off for local testing. Delete before launch.",
      discountType: "percent",
      percentOff: 10,
      maxRedemptions: 50,
      perUserLimit: 1,
      createdBy: "seed:demo",
    })
    .onConflictDoNothing();
  await db
    .insert(referralCodes)
    .values({ code: "DEMO-CAMPAIGN", label: "DEMO FIXTURE — test campaign", ownerType: "campaign", createdBy: "seed:demo" })
    .onConflictDoNothing();
  console.log("Demo fixtures: coupon DEMO10, referral DEMO-CAMPAIGN (clearly labelled; delete before launch).");
}
await pool.end();
