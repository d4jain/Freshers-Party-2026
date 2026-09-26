/**
 * Applies SQL migrations in ./drizzle using the *direct* (unpooled) connection.
 *   npm run db:migrate
 */
import "./lib/load-env.mts";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL_UNPOOLED (Neon direct connection) or DATABASE_URL first.");
  process.exit(1);
}
const pool = new Pool({ connectionString: url, max: 1 });
await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
await pool.end();
console.log("Migrations applied.");
