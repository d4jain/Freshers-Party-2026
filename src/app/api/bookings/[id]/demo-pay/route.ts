import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/session";
import { applyPaymentUpdate } from "@/lib/booking/confirm";
import { getBookingStatusForUser } from "@/lib/booking/status";
import { getDb } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import { background } from "@/lib/deps";
import { processEmailOutbox } from "@/lib/email/outbox";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { assertSameOrigin, errorResponse, json, readJson } from "@/lib/http";
import { resolvePaymentMode } from "@/lib/payments";
import { makeDemoPayment } from "@/lib/payments/demo";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ outcome: z.enum(["captured", "failed"]) });

/**
 * DEMO MODE ONLY. Simulates a gateway result through the real confirmation
 * service. Disabled in production and whenever Razorpay keys are configured.
 * Resulting passes are flagged demo and rejected at the door.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/bookings/[id]/demo-pay">) {
  try {
    assertSameOrigin(req);
    if (resolvePaymentMode().kind !== "demo" || env().isProduction) {
      throw new AppError("NOT_AVAILABLE", "Demo payments are disabled.", 404);
    }
    const user = await requireUserApi(req);
    const { id } = await ctx.params;
    const { outcome } = bodySchema.parse(await readJson(req));
    const db = getDb();
    const [booking] = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.id, id), eq(bookings.userId, user.id)))
      .limit(1);
    if (!booking || !booking.isDemo || !booking.gatewayOrderId) throw new AppError("NOT_FOUND", "Booking not found.", 404);

    const result = await applyPaymentUpdate(db, makeDemoPayment(booking.gatewayOrderId, booking.totalPaise, outcome), "demo", {
      expectBookingId: booking.id,
    });
    if (result.outcome === "confirmed") {
      background(() => processEmailOutbox(db, { appUrl: env().APP_URL, onlyBookingId: booking.id, limit: 1 }));
    }
    return json({ booking: await getBookingStatusForUser(db, user.id, booking.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
