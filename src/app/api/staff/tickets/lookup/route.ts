import { z } from "zod";
import { requireRoleApi } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { isDemoMode, ticketSigningSecret } from "@/lib/env";
import { assertSameOrigin, errorResponse, json, readJson, tooManyRequests } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { lookupTicket } from "@/lib/tickets/checkin";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ code: z.string().trim().min(8).max(200) });

/** Staff-only validation (read). Redemption is a separate explicit POST. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const staff = await requireRoleApi(req, ["staff", "admin"]);
    const db = getDb();
    const rl = await rateLimit(db, `checkin-lookup:${staff.id}`, 120, 60);
    if (!rl.allowed) return tooManyRequests(rl.resetAt);
    const { code } = bodySchema.parse(await readJson(req));
    const result = await lookupTicket(db, ticketSigningSecret(), code, isDemoMode());
    return json({ result });
  } catch (e) {
    return errorResponse(e);
  }
}
