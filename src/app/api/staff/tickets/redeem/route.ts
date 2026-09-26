import { z } from "zod";
import { requireRoleApi } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { assertSameOrigin, errorResponse, json, readJson, tooManyRequests } from "@/lib/http";
import { resolvePaymentMode } from "@/lib/payments";
import { rateLimit } from "@/lib/rate-limit";
import { redeemTicket } from "@/lib/tickets/checkin";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ ticketId: z.uuid() });

/** Staff-only, explicit mutation. Atomically admits a ticket once. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const staff = await requireRoleApi(req, ["staff", "admin"]);
    const db = getDb();
    const rl = await rateLimit(db, `checkin-redeem:${staff.id}`, 120, 60);
    if (!rl.allowed) return tooManyRequests(rl.resetAt);
    const { ticketId } = bodySchema.parse(await readJson(req));
    const result = await redeemTicket(db, {
      staffUserId: staff.id,
      ticketId,
      demoAllowed: resolvePaymentMode().kind === "demo",
    });
    return json({ result });
  } catch (e) {
    return errorResponse(e);
  }
}
