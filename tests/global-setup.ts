import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import type { TestProject } from "vitest/node";
import { startLocalPostgres } from "../scripts/lib/local-pg.mts";

/**
 * Starts a throwaway real PostgreSQL server and a migrated template database.
 * Each test file clones the template, so tests exercise real row locks,
 * constraints and concurrency — not mocks.
 */
export default async function setup(project: TestProject) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "freshers-test-pg-"));
  const port = 55000 + Math.floor(Math.random() * 4000);
  const { pg, url } = await startLocalPostgres({ dir, port, persistent: false, database: "freshers_template" });
  const pool = new Pool({ connectionString: url, max: 1 });
  await migrate(drizzle(pool), { migrationsFolder: path.resolve(import.meta.dirname, "../drizzle") });
  await pool.end();
  project.provide("pgBaseUrl", url.replace(/\/freshers_template$/, "/"));
  return async () => {
    await pg.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    pgBaseUrl: string;
  }
}
