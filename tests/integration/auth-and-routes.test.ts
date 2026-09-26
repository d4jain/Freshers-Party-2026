import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getAuth, resetAuth } from "@/lib/auth";
import { setDbOverride, type DB } from "@/lib/db";
import { bookings, referralCodes, user, verification } from "@/lib/db/schema";
import { setGatewayOverride } from "@/lib/payments";
import { createTestDatabase } from "../helpers/db";
import { bookingInput, FakeRazorpay, openSales } from "../helpers/fixtures";

let db: DB;
let cleanup: () => Promise<void>;
let gateway: FakeRazorpay;
const ORIGIN = "http://localhost:3000";

beforeAll(async () => {
  ({ db, cleanup } = await createTestDatabase());
  setDbOverride(db);
  process.env.RAZORPAY_KEY_ID = "rzp_test_FAKEKEY123";
  process.env.RAZORPAY_KEY_SECRET = "unused-in-fake";
  resetAuth();
});
afterAll(async () => {
  setDbOverride(undefined);
  setGatewayOverride(undefined);
  await cleanup();
});
beforeEach(async () => {
  await db.execute(sql`TRUNCATE bookings, referral_codes, "user", verification RESTART IDENTITY CASCADE`);
  await db.execute(sql`DELETE FROM event_settings`);
  await openSales(db);
  gateway = new FakeRazorpay();
  setGatewayOverride(gateway);
});

async function signUp(email: string, extra: Record<string, unknown> = {}) {
  return getAuth().api.signUpEmail({
    body: { name: "Meera Iyer", email, password: "a-strong-passphrase", phone: "98765 43210", ...extra } as never,
    asResponse: true,
  });
}

async function sessionCookieFor(email: string) {
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, email));
  const res = await getAuth().api.signInEmail({ body: { email, password: "a-strong-passphrase" }, asResponse: true });
  expect(res.status).toBe(200);
  const setCookie = res.headers.getSetCookie();
  return setCookie.map((c) => c.split(";")[0]).join("; ");
}

function jsonRequest(path: string, body: unknown, cookie?: string, origin = ORIGIN) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

describe("accounts", () => {
  it("signs up with a normalised phone and email; role cannot be self-assigned", async () => {
    const res = await signUp("Meera@Example.com", { role: "admin" });
    expect(res.status).toBe(200);
    const [u] = await db.select().from(user).where(eq(user.email, "meera@example.com"));
    expect(u!.phone).toBe("+919876543210");
    expect(u!.role).toBe("user");
  });

  it("rejects duplicate emails (case-insensitive)", async () => {
    expect((await signUp("dup@example.com")).status).toBe(200);
    const again = await signUp("DUP@example.com");
    expect(again.status).toBe(422);
  });

  it("rejects invalid phone numbers and unknown referral codes", async () => {
    expect((await signUp("p@example.com", { phone: "12345" })).status).toBe(400);
    expect((await signUp("r@example.com", { signupReferralCode: "NOPE-CODE" })).status).toBe(400);
  });

  it("stores a valid signup referral for attribution only", async () => {
    const [ref] = await db.insert(referralCodes).values({ code: "CAMPUS-1", label: "Campus", ownerType: "campaign" }).returning();
    expect((await signUp("ref@example.com", { signupReferralCode: " campus-1 " })).status).toBe(200);
    const [u] = await db.select().from(user).where(eq(user.email, "ref@example.com"));
    expect(u!.signupReferralCodeId).toBe(ref!.id);
  });

  it("logs in with a database session cookie and rejects wrong passwords", async () => {
    await signUp("login@example.com");
    const cookie = await sessionCookieFor("login@example.com");
    expect(cookie).toMatch(/session_token=/);
    const bad = await getAuth().api.signInEmail({
      body: { email: "login@example.com", password: "wrong-password" },
      asResponse: true,
    });
    expect(bad.status).toBe(401);
  });

  it("rejects expired password-reset tokens", async () => {
    await signUp("reset@example.com");
    await getAuth().api.requestPasswordReset({ body: { email: "reset@example.com", redirectTo: "/reset-password" } });
    const [v] = await db
      .select()
      .from(verification)
      .where(sql`${verification.identifier} LIKE 'reset-password:%'`);
    const token = v!.identifier.replace("reset-password:", "");
    await db
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(verification.id, v!.id));
    const res = await getAuth().api.resetPassword({ body: { newPassword: "another-strong-pass", token }, asResponse: true });
    expect(res.status).toBe(400);
  });
});

describe("protected API routes", () => {
  it("requires a session and a same-origin request", async () => {
    const { POST } = await import("@/app/api/bookings/route");
    const anon = await POST(jsonRequest("/api/bookings", bookingInput()));
    expect(anon.status).toBe(401);
    await signUp("csrf@example.com");
    const cookie = await sessionCookieFor("csrf@example.com");
    const cross = await POST(jsonRequest("/api/bookings", bookingInput(), cookie, "https://evil.example"));
    expect(cross.status).toBe(403);
  });

  it("creates a checkout, hides other users' bookings, and rejects forged callbacks", async () => {
    const { POST } = await import("@/app/api/bookings/route");
    const { GET } = await import("@/app/api/bookings/[id]/route");
    const verify = (await import("@/app/api/bookings/[id]/verify/route")).POST;

    await signUp("owner@example.com");
    await signUp("other@example.com");
    const owner = await sessionCookieFor("owner@example.com");
    const other = await sessionCookieFor("other@example.com");

    const created = await POST(jsonRequest("/api/bookings", { ...bookingInput(), totalPaise: 1 }, owner));
    expect(created.status).toBe(200);
    const { checkout } = (await created.json()) as {
      checkout: { bookingId: string; order: { id: string; amountPaise: number } };
    };
    expect(checkout.order.amountPaise).toBe(439_800);
    const params = { params: Promise.resolve({ id: checkout.bookingId }) };

    const mine = await GET(
      new Request(`${ORIGIN}/api/bookings/${checkout.bookingId}`, { headers: { cookie: owner } }),
      params as never,
    );
    expect(mine.status).toBe(200);
    const theirs = await GET(
      new Request(`${ORIGIN}/api/bookings/${checkout.bookingId}`, { headers: { cookie: other } }),
      params as never,
    );
    expect(theirs.status).toBe(404);

    const p = gateway.pay(checkout.order.id, "captured");
    const forged = await verify(
      jsonRequest(
        `/api/bookings/${checkout.bookingId}/verify`,
        {
          razorpay_payment_id: p.id,
          razorpay_order_id: checkout.order.id,
          razorpay_signature: "a".repeat(64),
        },
        owner,
      ),
      params as never,
    );
    expect(forged.status).toBe(400);
    const [still] = await db.select().from(bookings).where(eq(bookings.id, checkout.bookingId));
    expect(still!.status).toBe("pending_payment");

    const crossUser = await verify(
      jsonRequest(
        `/api/bookings/${checkout.bookingId}/verify`,
        {
          razorpay_payment_id: p.id,
          razorpay_order_id: checkout.order.id,
          razorpay_signature: gateway.signCheckout(checkout.order.id, p.id),
        },
        other,
      ),
      params as never,
    );
    expect(crossUser.status).toBe(404);

    const genuine = await verify(
      jsonRequest(
        `/api/bookings/${checkout.bookingId}/verify`,
        {
          razorpay_payment_id: p.id,
          razorpay_order_id: checkout.order.id,
          razorpay_signature: gateway.signCheckout(checkout.order.id, p.id),
        },
        owner,
      ),
      params as never,
    );
    expect(genuine.status).toBe(200);
    const body = (await genuine.json()) as { booking: { status: string; ticketCount: number } };
    expect(body.booking.status).toBe("confirmed");
    expect(body.booking.ticketCount).toBe(2);
  });

  it("keeps staff endpoints closed to regular users", async () => {
    const { POST } = await import("@/app/api/staff/tickets/redeem/route");
    await signUp("plain@example.com");
    const cookie = await sessionCookieFor("plain@example.com");
    const res = await POST(
      jsonRequest("/api/staff/tickets/redeem", { ticketId: "00000000-0000-4000-8000-000000000000" }, cookie),
    );
    expect(res.status).toBe(403);
  });
});
