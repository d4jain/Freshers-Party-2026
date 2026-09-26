import { requireUserApi } from "@/lib/auth/session";
import { reconcileBooking } from "@/lib/booking/reconcile";
import { getBookingStatusForUser } from "@/lib/booking/status";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { errorResponse, json } from "@/lib/http";
import { getGateway } from "@/lib/payments";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Owner-only booking status for polling after checkout, reloads and network
 * interruptions. While payment is unresolved it occasionally asks the
 * gateway directly (rate-limited), so a missed webhook doesn't leave the
 * customer stuck.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/bookings/[id]">) {
  try {
    const user = await requireUserApi(req);
    const { id } = await ctx.params;
    const db = getDb();
    let view = await getBookingStatusForUser(db, user.id, id);
    if (!view) throw new AppError("NOT_FOUND", "Booking not found.", 404);

    const unresolved = view.status === "pending_payment" || (view.status === "expired" && view.paymentEvidence !== "none");
    const gateway = getGateway();
    if (unresolved && gateway && gateway.provider === view.provider && gateway.provider !== "demo") {
      const rl = await rateLimit(db, `status-sync:${id}`, 1, 15);
      if (rl.allowed) {
        try {
          await reconcileBooking(db, gateway, id);
          view = (await getBookingStatusForUser(db, user.id, id)) ?? view;
        } catch {
          // Gateway unreachable — keep showing "Checking payment status".
        }
      }
    }
    return json({ booking: view });
  } catch (e) {
    return errorResponse(e);
  }
}
