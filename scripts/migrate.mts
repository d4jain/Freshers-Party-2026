/**
 * Applies SQL migrations in ./drizzle using the *direct* (unpooled) connection.
 *   npm run db:migrate
 */
import { scriptDatabaseUrl } from "./lib/load-env.mts";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const url = scriptDatabaseUrl();
const pool = new Pool({ connectionString: url, max: 1 });
await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
await pool.end();
console.log("Migrations applied.");
