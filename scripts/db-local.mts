/**
 * Local development database: a real PostgreSQL 18 server in ./.data/postgres.
 *   npm run db:local        (keep it running in its own terminal)
 * Then set in .env.local:
 *   DATABASE_URL=postgres://freshers:freshers-local-only@127.0.0.1:54329/freshers
 */
import fs from "node:fs";
import net from "node:net";
import { startLocalPostgres } from "./lib/local-pg.mts";

const port = Number(process.env.LOCAL_PG_PORT ?? 54329);
const url = `postgres://freshers:freshers-local-only@127.0.0.1:${port}/freshers`;

const portInUse = await new Promise<boolean>((resolve) => {
  const socket = net.connect({ host: "127.0.0.1", port }, () => {
    socket.end();
    resolve(true);
  });
  socket.on("error", () => resolve(false));
});

if (portInUse) {
  const pidFile = ".data/postgres/postmaster.pid";
  const pid = fs.existsSync(pidFile) ? fs.readFileSync(pidFile, "utf8").split("\n")[0] : null;
  console.log(
    `\nSomething is already listening on port ${port}${pid ? ` (this project's Postgres, PID ${pid})` : ""}.` +
      `\nIf it's the local database, you're all set:\n  DATABASE_URL=${url}` +
      `\n\nTo stop it: ${pid ? `kill ${pid}` : `lsof -nP -iTCP:${port} -sTCP:LISTEN`}` +
      `\nTo use another port: LOCAL_PG_PORT=54330 npm run db:local\n`,
  );
  process.exit(0);
}

const started = await startLocalPostgres({ dir: ".data/postgres", port, persistent: true, database: "freshers" }).catch(
  (e: unknown) => {
    console.error(`\nCouldn't start local Postgres: ${e instanceof Error ? e.message : String(e ?? "unknown error")}`);
    console.error(
      "If a previous run crashed, delete .data/postgres/postmaster.pid (only when no postgres process is running).\n",
    );
    process.exit(1);
  },
);
const { pg } = started;
console.log(`\nLocal Postgres is running.\n  DATABASE_URL=${url}\n\nPress Ctrl+C to stop.\n`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
