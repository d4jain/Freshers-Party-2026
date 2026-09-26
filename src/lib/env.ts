import "server-only";
import { z } from "zod";

/**
 * Server environment. Parsed lazily so `next build` works without secrets;
 * each feature checks what it needs and reports an actionable setup message.
 */
const boolish = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_ENV: z.enum(["development", "preview", "production", "test"]).optional(),
  VERCEL_ENV: optionalString,
  NODE_ENV: optionalString,

  DATABASE_URL: optionalString,
  DATABASE_URL_UNPOOLED: optionalString,

  BETTER_AUTH_SECRET: optionalString,
  REQUIRE_EMAIL_VERIFICATION: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v !== "false"),

  DEMO_MODE: boolish,

  EMAIL_PROVIDER: z.enum(["resend", "console", "none"]).optional(),
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  EMAIL_REPLY_TO: optionalString,

  CRON_SECRET: optionalString,
  TICKET_SIGNING_SECRET: optionalString,
  TRUST_PROXY_HEADERS: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v !== "false"),
});

export type ServerEnv = z.infer<typeof schema> & {
  appEnv: "development" | "preview" | "production" | "test";
  isProduction: boolean;
};

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.parse(process.env);
  const appEnv =
    parsed.APP_ENV ??
    (parsed.VERCEL_ENV === "production"
      ? "production"
      : parsed.VERCEL_ENV === "preview"
        ? "preview"
        : parsed.NODE_ENV === "test"
          ? "test"
          : "development");
  cached = { ...parsed, appEnv, isProduction: appEnv === "production" };
  return cached;
}

/** For tests that mutate process.env. */
export function resetEnvCache() {
  cached = undefined;
}

export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly setupHint: string,
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

const DEV_AUTH_SECRET = "dev-only-insecure-secret-change-me-0123456789abcdef";

export function authSecret(): string {
  const e = env();
  if (e.BETTER_AUTH_SECRET) return e.BETTER_AUTH_SECRET;
  if (e.isProduction || e.appEnv === "preview") {
    throw new ConfigError(
      "BETTER_AUTH_SECRET is not set",
      "Generate one with `openssl rand -base64 32` and add it to the environment.",
    );
  }
  return DEV_AUTH_SECRET;
}

export function ticketSigningSecret(): string {
  const e = env();
  if (e.TICKET_SIGNING_SECRET) return e.TICKET_SIGNING_SECRET;
  if (e.isProduction || e.appEnv === "preview") {
    throw new ConfigError(
      "TICKET_SIGNING_SECRET is not set",
      "Generate one with `openssl rand -base64 32`. Rotating it invalidates every issued pass.",
    );
  }
  return `${DEV_AUTH_SECRET}-tickets`;
}

export function appOrigin(): string {
  return new URL(env().APP_URL).origin;
}

/**
 * DEMO mode (development/preview only): lets you try the whole flow before
 * capacity and policies are configured. Demo bookings and passes are flagged
 * and rejected at the door. Never active in production.
 */
export function isDemoMode(): boolean {
  const e = env();
  return Boolean(e.DEMO_MODE) && !e.isProduction;
}
