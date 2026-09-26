import "server-only";
import { ZodError } from "zod";
import { appOrigin, ConfigError } from "@/lib/env";
import { AppError, isAppError } from "@/lib/errors";

export const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { ...NO_STORE, ...extraHeaders } });
}

export function errorResponse(e: unknown): Response {
  if (isAppError(e)) {
    return json({ error: { code: e.code, message: e.message, ...(e.extra ?? {}) } }, e.status);
  }
  if (e instanceof ZodError) {
    return json(
      { error: { code: "INVALID_INPUT", message: "Please check the highlighted fields.", fields: e.flatten().fieldErrors } },
      400,
    );
  }
  if (e instanceof ConfigError) {
    console.error(`[config] ${e.message}`);
    return json(
      { error: { code: "NOT_CONFIGURED", message: "This feature isn’t configured yet.", setupHint: e.setupHint } },
      503,
    );
  }
  // Never echo internals or personal data back to the client.
  console.error("[api] unexpected error", e instanceof Error ? `${e.name}: ${e.message}` : e);
  return json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } }, 500);
}

/**
 * CSRF defence for cookie-authenticated mutations: the request must come
 * from our own origin. Browsers always send Origin on cross-site POSTs.
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin) {
    if (origin !== appOrigin()) throw new AppError("BAD_ORIGIN", "Request blocked.", 403);
    return;
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new AppError("BAD_ORIGIN", "Request blocked.", 403);
}

export async function readJson(req: Request, maxBytes = 16_384): Promise<unknown> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw new AppError("UNSUPPORTED_MEDIA", "Expected JSON.", 415);
  const text = await req.text();
  if (text.length > maxBytes) throw new AppError("PAYLOAD_TOO_LARGE", "Request too large.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("INVALID_JSON", "Malformed request.", 400);
  }
}

export function tooManyRequests(resetAt: Date) {
  const retry = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
  return json({ error: { code: "RATE_LIMITED", message: "Too many attempts. Please wait a moment and try again." } }, 429, {
    "Retry-After": String(retry),
  });
}
