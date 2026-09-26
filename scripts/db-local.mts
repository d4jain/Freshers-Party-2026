/**
 * Local development database: a real PostgreSQL 18 server in ./.data/postgres.
 *   npm run db:local        (keep it running in its own terminal)
 * Then set in .env.local:
 *   DATABASE_URL=postgres://freshers:freshers-local-only@127.0.0.1:54329/freshers
 */
import { startLocalPostgres } from "./lib/local-pg.mts";

const port = Number(process.env.LOCAL_PG_PORT ?? 54329);

const { pg, url } = await startLocalPostgres({ dir: ".data/postgres", port, persistent: true, database: "freshers" });
console.log(`\nLocal Postgres is running.\n  DATABASE_URL=${url}\n\nPress Ctrl+C to stop.\n`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
