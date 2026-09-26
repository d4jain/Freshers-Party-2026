import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { Pool } from "pg";
import type { Page } from "@playwright/test";

config({ path: ".env.local", quiet: true });

let pool: Pool | null = null;
export function db() {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  return pool;
}

export function uniqueEmail(tag: string) {
  return `e2e-${tag}-${randomUUID().slice(0, 8)}@example.test`;
}

/** Each test gets its own client IP so the per-IP auth rate limits don't collide. */
export async function useFreshIp(page: Page) {
  const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
}

export async function signUpAndVerify(page: Page, email: string, opts: { from?: string | null; password?: string } = {}) {
  const password = opts.password ?? "party-password-2026";
  if (opts.from !== null) await page.goto(opts.from ?? "/signup");
  await page.getByLabel("Full name").fill("Riya Verma");
  await page.getByLabel("Phone number").fill("98765 43210");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Account created.").waitFor();
  // The verification email goes to the console provider in dev; mark verified directly.
  await db().query(`UPDATE "user" SET email_verified = true WHERE email = $1`, [email]);
}

export async function setRole(email: string, role: "admin" | "staff" | "user") {
  await db().query(`UPDATE "user" SET role = $2 WHERE email = $1`, [email, role]);
}

export async function login(page: Page, email: string, password = "party-password-2026") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/account/);
}

export async function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}
