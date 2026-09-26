import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";

/**
 * Starts a real PostgreSQL server from the `embedded-postgres` dev dependency.
 * Used for local development (`npm run db:local`) and the integration tests.
 * Production uses Neon; nothing here ships to the app runtime.
 */
export async function startLocalPostgres(opts: { dir: string; port: number; persistent: boolean; database: string }) {
  const dir = path.resolve(opts.dir);
  const fresh = !fs.existsSync(path.join(dir, "PG_VERSION"));
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    port: opts.port,
    user: "freshers",
    password: "freshers-local-only",
    persistent: opts.persistent,
    authMethod: "scram-sha-256",
    onLog: () => {},
    onError: (m) => {
      const s = String(m);
      if (!/database system is ready|shutting down|could not bind IPv6/i.test(s)) console.error("[postgres]", s.trim());
    },
  });
  if (fresh) await pg.initialise();
  await pg.start();
  const client = pg.getPgClient("postgres");
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [opts.database]);
  if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${opts.database}"`);
  await client.end();
  const url = `postgres://freshers:freshers-local-only@127.0.0.1:${opts.port}/${opts.database}`;
  return { pg, url };
}
