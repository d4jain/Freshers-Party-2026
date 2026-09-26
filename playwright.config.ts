import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests run against a local dev server in DEMO mode (no real
 * payments) with the local Postgres from `npm run db:local`.
 * Uses the system Chrome (`channel: "chrome"`) — no browser download needed.
 * A dedicated port avoids hitting some other app already on :3000.
 */
const PORT = Number(process.env.E2E_PORT ?? 3210);
const BASE = `http://localhost:${PORT}`;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: BASE,
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE,
    env: { APP_URL: BASE, DEMO_MODE: "true", EMAIL_PROVIDER: "console" },
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    {
      name: "mobile-360",
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: false },
    },
    { name: "desktop-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
});
