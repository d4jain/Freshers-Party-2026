import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { ConfigError } from "@/lib/env";
import { schema } from "./schema";

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
/** Anything that can run queries: the root db or an open transaction. */
export type Queryable = DB | Tx;

type Holder = { pool?: Pool; db?: DB; override?: DB };
const holder = ((globalThis as unknown as { __freshersDb?: Holder }).__freshersDb ??= {});

export function createPool(connectionString: string, max = 5) {
  return new Pool({
    connectionString,
    max,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // Neon pooled URLs include sslmode=require; local embedded Postgres does not use TLS.
  });
}

/**
 * App connection. Use Neon's *pooled* connection string (host contains
 * `-pooler`) in DATABASE_URL. Only transaction-scoped features are used
 * (row locks, `pg_advisory_xact_lock`), which are safe behind PgBouncer
 * transaction pooling.
 */
export function getDb(): DB {
  if (holder.override) return holder.override;
  if (holder.db) return holder.db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new ConfigError(
      "DATABASE_URL is not set",
      "Run `npm run db:local` for a local Postgres, or set DATABASE_URL to your Neon pooled connection string.",
    );
  }
  holder.pool = createPool(url);
  holder.db = drizzle(holder.pool, { schema });
  return holder.db;
}

export function isDatabaseConfigured() {
  return Boolean(holder.override || process.env.DATABASE_URL);
}

/** Test hook: route all queries to a specific database. */
export function setDbOverride(db: DB | undefined) {
  holder.override = db;
}

export { schema };
