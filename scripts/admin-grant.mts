/**
 * Secure role provisioning. Roles can only be set here (server-side, with
 * database credentials) — never through signup or a public request.
 * The person must sign up first, and verify their email unless
 * REQUIRE_EMAIL_VERIFICATION=false (same switch the app uses).
 *   npm run admin:grant -- --email organiser@example.com --role admin
 *   npm run admin:grant -- --email volunteer@example.com --role staff
 *   npm run admin:grant -- --email someone@example.com --role user   (revoke)
 */
import { scriptDatabaseUrl } from "./lib/load-env.mts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { auditEvents, schema, session, user } from "../src/lib/db/schema";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const email = arg("email")?.trim().toLowerCase();
const role = arg("role");
if (!email || !role || !["admin", "staff", "user"].includes(role)) {
  console.error("Usage: npm run admin:grant -- --email <email> --role <admin|staff|user>");
  process.exit(1);
}
const url = scriptDatabaseUrl();
const pool = new Pool({ connectionString: url, max: 1 });
const db = drizzle(pool, { schema });
const [u] = await db.select().from(user).where(eq(user.email, email)).limit(1);
if (!u) {
  console.error(`No account for ${email}. Ask them to sign up first.`);
  await pool.end();
  process.exit(1);
}
const requireVerified = process.env.REQUIRE_EMAIL_VERIFICATION !== "false";
if (role !== "user" && requireVerified && !u.emailVerified) {
  console.error(`${email} hasn't verified their email yet. Ask them to verify before granting ${role}.`);
  await pool.end();
  process.exit(1);
}
await db.transaction(async (tx) => {
  await tx
    .update(user)
    .set({ role: role as "admin" | "staff" | "user" })
    .where(eq(user.id, u.id));
  // Force a fresh login so the new role takes effect everywhere.
  await tx.delete(session).where(eq(session.userId, u.id));
  await tx.insert(auditEvents).values({
    actorUserId: null,
    actorLabel: `cli:admin-grant (${process.env.USER ?? "unknown"})`,
    action: "user.role_changed",
    targetType: "user",
    targetId: u.id,
    details: { email, from: u.role, to: role },
  });
});
console.log(`${email}: role ${u.role} → ${role}. Existing sessions were signed out.`);
if (role !== "user" && !u.emailVerified) {
  console.warn("Note: this email is unverified (REQUIRE_EMAIL_VERIFICATION=false). Only grant roles to people you know.");
}
await pool.end();
