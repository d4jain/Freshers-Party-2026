import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { inject } from "vitest";
import type { DB } from "@/lib/db";
import { schema } from "@/lib/db/schema";

export async function createTestDatabase(): Promise<{ db: DB; pool: Pool; url: string; cleanup: () => Promise<void> }> {
  const base = inject("pgBaseUrl");
  const name = `t_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  for (let attempt = 0; ; attempt++) {
    const admin = new Client({ connectionString: `${base}postgres` });
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE ${name} TEMPLATE freshers_template`);
      break;
    } catch (e) {
      if (attempt > 10) throw e;
      await new Promise((r) => setTimeout(r, 100 + Math.random() * 300));
    } finally {
      await admin.end();
    }
  }
  const url = `${base}${name}`;
  const pool = new Pool({ connectionString: url, max: 12 });
  const db = drizzle(pool, { schema });
  return {
    db,
    pool,
    url,
    cleanup: async () => {
      await pool.end();
      const admin = new Client({ connectionString: `${base}postgres` });
      await admin.connect();
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}
