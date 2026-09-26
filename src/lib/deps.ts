import "server-only";
import { after } from "next/server";
import { getDb } from "@/lib/db";
import { env, isDemoMode } from "@/lib/env";

/** Wiring for route handlers; services themselves take explicit dependencies. */
export function checkoutDeps() {
  return {
    db: getDb(),
    demo: isDemoMode(),
    requireVerifiedEmail: env().REQUIRE_EMAIL_VERIFICATION,
  };
}

/** Runs work after the response without failing the request (email kicks etc.). */
export function background(task: () => Promise<unknown>) {
  const run = () => task().catch((e) => console.error("[background]", e instanceof Error ? e.message : e));
  try {
    after(run); // keeps serverless functions alive until the task finishes
  } catch {
    void run(); // outside a request scope (scripts/tests)
  }
}
