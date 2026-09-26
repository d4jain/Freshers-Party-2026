import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Same precedence as Next.js: .env.local overrides .env.
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

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
