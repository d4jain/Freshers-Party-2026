import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Migrations use the direct (unpooled) Neon connection when available.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "postgres://localhost/unset";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
