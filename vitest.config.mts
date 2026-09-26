import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside React Server Components; tests import server modules directly.
      "server-only": path.resolve(import.meta.dirname, "tests/helpers/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    pool: "forks",
    env: {
      APP_ENV: "test",
      APP_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
      TICKET_SIGNING_SECRET: "test-ticket-secret-test-ticket-secret",
      EMAIL_PROVIDER: "none",
    },
  },
});
