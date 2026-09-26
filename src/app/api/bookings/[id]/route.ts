import { requireUserApi } from "@/lib/auth/session";
import { getBookingStatusForUser } from "@/lib/booking/status";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { errorResponse, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Owner-only booking status (polled while a booking is in review). */
export async function GET(req: Request, ctx: RouteContext<"/api/bookings/[id]">) {
  try {
    const user = await requireUserApi(req);
    const { id } = await ctx.params;
    const view = await getBookingStatusForUser(getDb(), user.id, id);
    if (!view) throw new AppError("NOT_FOUND", "Booking not found.", 404);
    return json({ booking: view });
  } catch (e) {
    return errorResponse(e);
  }
}
