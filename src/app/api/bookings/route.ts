import { requireUserApi } from "@/lib/auth/session";
import { createCheckout } from "@/lib/booking/checkout";
import { checkoutDeps } from "@/lib/deps";
import { env } from "@/lib/env";
import { assertSameOrigin, errorResponse, json, readJson, tooManyRequests } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { bookingRequestSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Creates (or idempotently reuses) a pending booking with held places and a
 * gateway order. The browser receives only the public key id, order id,
 * trusted amount and prefill data — never secrets or computed-by-client totals.
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUserApi(req);
    const deps = checkoutDeps();
    const rl = await rateLimit(deps.db, `checkout:${user.id}`, 12, 60);
    if (!rl.allowed) return tooManyRequests(rl.resetAt);

    const input = bookingRequestSchema.parse(await readJson(req));
    const payload = await createCheckout(deps, user.id, input);
    return json({ checkout: payload, appEnv: env().appEnv });
  } catch (e) {
    return errorResponse(e);
  }
}
