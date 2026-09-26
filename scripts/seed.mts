/**
 * Seeds the event settings row from src/config/event.ts (never overwrites an
 * existing row). With --demo, also adds clearly labelled demo coupon and
 * referral fixtures for local testing. Refuses --demo in production.
 *   npm run db:seed
 *   npm run db:seed -- --demo
 */
import "./lib/load-env.mts";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { coupons, referralCodes, schema } from "../src/lib/db/schema";
import { getSettings } from "../src/lib/settings";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL first.");
  process.exit(1);
}
const demo = process.argv.includes("--demo");
const isProd = process.env.APP_ENV === "production" || process.env.VERCEL_ENV === "production";
if (demo && isProd) {
  console.error("Refusing to create demo fixtures in production.");
  process.exit(1);
}

const pool = new Pool({ connectionString: url, max: 1 });
const db = drizzle(pool, { schema });
const settings = await getSettings(db);
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
