import { and, eq } from "drizzle-orm";
import { requireUserApi } from "@/lib/auth/session";
import { ensureGatewayOrder, type CheckoutPayload } from "@/lib/booking/checkout";
import { bookings } from "@/lib/db/schema";
import { checkoutDeps } from "@/lib/deps";
import { AppError } from "@/lib/errors";
import { assertSameOrigin, errorResponse, json } from "@/lib/http";
import type { PriceBreakdown } from "@/lib/pricing";

export const dynamic = "force-dynamic";

/** Re-opens checkout for the user's own pending booking while its hold is live (e.g. after dismissal or reload). */
export async function POST(req: Request, ctx: RouteContext<"/api/bookings/[id]/resume">) {
  try {
    assertSameOrigin(req);
    const user = await requireUserApi(req);
    const { id } = await ctx.params;
    const deps = checkoutDeps();
    const [booking] = await deps.db
      .select()
      .from(bookings)
      .where(and(eq(bookings.id, id), eq(bookings.userId, user.id)))
      .limit(1);
    if (!booking) throw new AppError("NOT_FOUND", "Booking not found.", 404);
    if (booking.status !== "pending_payment") {
      throw new AppError("NOT_PAYABLE", "This booking can’t be paid any more.", 409, { status: booking.status });
    }
    if (booking.holdExpiresAt <= new Date()) {
      throw new AppError("HOLD_EXPIRED", "Your held places expired. Please start a new booking.", 409);
    }
    if (!deps.gateway || deps.gateway.provider !== booking.paymentProvider) {
      throw new AppError("PROVIDER_CHANGED", "Payment settings changed. Please start your booking again.", 409);
    }
    const withOrder = await ensureGatewayOrder(deps.db, deps.gateway, booking);
    const payload: CheckoutPayload = {
      bookingId: withOrder.id,
      reference: withOrder.reference,
      status: withOrder.status,
      provider: withOrder.paymentProvider as "razorpay" | "demo",
      isDemo: withOrder.isDemo,
      reused: true,
      keyId: deps.gateway.publicKeyId,
      order: withOrder.gatewayOrderId
        ? { id: withOrder.gatewayOrderId, amountPaise: withOrder.totalPaise, currency: "INR" }
        : null,
      holdExpiresAt: withOrder.holdExpiresAt.toISOString(),
      breakdown: withOrder.pricingSnapshot as PriceBreakdown,
      prefill: { name: withOrder.bookerName, email: withOrder.bookerEmail, contact: withOrder.bookerPhone },
    };
    return json({ checkout: payload });
  } catch (e) {
    return errorResponse(e);
  }
}
