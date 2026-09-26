import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { and, eq } from "drizzle-orm";
import { isValidCodeFormat, normalizeCode } from "@/lib/codes";
import { getDb } from "@/lib/db";
import { referralCodes, schema } from "@/lib/db/schema";
import { getEmailProvider } from "@/lib/email/provider";
import { passwordResetEmail, verificationEmail } from "@/lib/email/templates";
import { authSecret, env } from "@/lib/env";
import { normalizeIndianMobile } from "@/lib/phone";
import { nameSchema, PASSWORD_MAX, PASSWORD_MIN } from "@/lib/validation";

async function sendAuthEmail(to: string, content: ReturnType<typeof verificationEmail>) {
  const provider = getEmailProvider();
  if (!provider) {
    console.error("[auth] No email provider configured; could not send:", content.subject);
    return;
  }
  const res = await provider.send({ ...content, to });
  if (!res.ok) console.error("[auth] Email send failed:", res.error);
}

function createAuth() {
  const e = env();
  const db = getDb();
  return betterAuth({
    appName: "Freshers’ Party 2026",
    baseURL: e.APP_URL,
    basePath: "/api/auth",
    secret: authSecret(),
    trustedOrigins: [new URL(e.APP_URL).origin],
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
      autoSignIn: true,
      requireEmailVerification: false, // login allowed; booking requires a verified email
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendAuthEmail(user.email, passwordResetEmail(url));
      },
    },
    emailVerification: {
      // Only send verification emails when verification is actually required.
      sendOnSignUp: e.REQUIRE_EMAIL_VERIFICATION,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        await sendAuthEmail(user.email, verificationEmail(url));
      },
    },
    session: {
      // Database sessions; the cookie holds only an opaque, HTTP-only session token.
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
    },
    user: {
      additionalFields: {
        phone: { type: "string", required: true, input: true },
        role: { type: "string", required: false, input: false, defaultValue: "user" },
        marketingOptIn: { type: "boolean", required: false, input: true, defaultValue: false },
        signupReferralCode: { type: "string", required: false, input: true },
        signupReferralCodeId: { type: "string", required: false, input: false, returned: false },
      },
    },
    rateLimit: {
      enabled: e.appEnv !== "test",
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60 * 10, max: 5 },
        "/request-password-reset": { window: 60 * 15, max: 3 },
        "/reset-password": { window: 60 * 15, max: 5 },
        "/send-verification-email": { window: 60 * 15, max: 3 },
      },
    },
    advanced: {
      useSecureCookies: e.APP_URL.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
      ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const name = nameSchema.safeParse(user.name);
            if (!name.success) throw new APIError("BAD_REQUEST", { message: "Enter your full name." });
            const phone = normalizeIndianMobile(String(user.phone ?? ""));
            if (!phone) throw new APIError("BAD_REQUEST", { message: "Enter a valid Indian mobile number." });

            let signupReferralCode: string | null = null;
            let signupReferralCodeId: string | null = null;
            const code = normalizeCode(typeof user.signupReferralCode === "string" ? user.signupReferralCode : null);
            if (code) {
              if (!isValidCodeFormat(code)) {
                throw new APIError("BAD_REQUEST", { message: "That referral code isn’t valid." });
              }
              const [ref] = await getDb()
                .select()
                .from(referralCodes)
                .where(and(eq(referralCodes.code, code), eq(referralCodes.active, true)))
                .limit(1);
              if (!ref) throw new APIError("BAD_REQUEST", { message: "That referral code isn’t recognised." });
              signupReferralCode = ref.code;
              signupReferralCodeId = ref.id;
            }
            return {
              data: {
                ...user,
                name: name.data,
                phone,
                role: "user", // roles are only assigned by `npm run admin:grant`
                marketingOptIn: user.marketingOptIn === true,
                signupReferralCode,
                signupReferralCodeId,
              },
            };
          },
        },
        update: {
          before: async (data, ctx) => {
            // Users may change name/phone/marketing preference; never role or attribution.
            const next: Record<string, unknown> = { ...data };
            if (ctx?.path === "/update-user") {
              delete next.role;
              delete next.signupReferralCode;
              delete next.signupReferralCodeId;
              delete next.emailVerified;
            }
            if (typeof next.phone === "string") {
              const phone = normalizeIndianMobile(next.phone);
              if (!phone) throw new APIError("BAD_REQUEST", { message: "Enter a valid Indian mobile number." });
              next.phone = phone;
            }
            if (typeof next.name === "string") {
              const name = nameSchema.safeParse(next.name);
              if (!name.success) throw new APIError("BAD_REQUEST", { message: "Enter your full name." });
              next.name = name.data;
            }
            return { data: next };
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const holder = ((globalThis as unknown as { __freshersAuth?: { auth?: Auth } }).__freshersAuth ??= {});

/** Lazily created so `next build` doesn't need database credentials. */
export function getAuth(): Auth {
  holder.auth ??= createAuth();
  return holder.auth;
}

/** Test hook to rebuild after env/db changes. */
export function resetAuth() {
  holder.auth = undefined;
}
