import { and, eq } from "drizzle-orm";
import { requireUserApi } from "@/lib/auth/session";
import { applyPaymentUpdate } from "@/lib/booking/confirm";
import { getBookingStatusForUser } from "@/lib/booking/status";
import { getDb } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import { background } from "@/lib/deps";
import { processEmailOutbox } from "@/lib/email/outbox";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { assertSameOrigin, errorResponse, json, readJson, tooManyRequests } from "@/lib/http";
import { getGateway } from "@/lib/payments";
import { rateLimit } from "@/lib/rate-limit";
import { razorpayCallbackSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Checkout success callback. The signature is verified with the order id
 * stored in OUR database, ownership is checked, and the payment is fetched
 * from Razorpay. Only a captured payment for the exact stored amount can
 * confirm the booking — the client callback alone never issues passes.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/bookings/[id]/verify">) {
  try {
    assertSameOrigin(req);
    const user = await requireUserApi(req);
    const { id } = await ctx.params;
    const db = getDb();
    const rl = await rateLimit(db, `verify:${user.id}`, 20, 60);
    if (!rl.allowed) return tooManyRequests(rl.resetAt);

    const body = razorpayCallbackSchema.parse(await readJson(req));
    const [booking] = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.id, id), eq(bookings.userId, user.id)))
      .limit(1);
    if (!booking) throw new AppError("NOT_FOUND", "Booking not found.", 404);

    const gateway = getGateway();
    if (!gateway || gateway.provider !== "razorpay" || booking.paymentProvider !== "razorpay") {
      throw new AppError("PAYMENTS_DISABLED", "Online checkout isn’t available.", 503);
    }
    if (!booking.gatewayOrderId || body.razorpay_order_id !== booking.gatewayOrderId) {
      throw new AppError("ORDER_MISMATCH", "This payment doesn’t belong to this booking.", 400);
    }
    const signatureOk = gateway.verifyCheckoutSignature({
      orderId: booking.gatewayOrderId,
      paymentId: body.razorpay_payment_id,
      signature: body.razorpay_signature,
    });
    if (!signatureOk) throw new AppError("BAD_SIGNATURE", "We couldn’t verify this payment response.", 400);

    let payment;
    try {
      payment = await gateway.fetchPayment(body.razorpay_payment_id);
    } catch {
      // Signature was valid but Razorpay is unreachable: tell the client to keep checking.
      const view = await getBookingStatusForUser(db, user.id, booking.id);
      return json({ booking: view, pendingVerification: true }, 202);
    }
    if (payment.orderId !== booking.gatewayOrderId) {
      throw new AppError("ORDER_MISMATCH", "This payment doesn’t belong to this booking.", 400);
    }

    const result = await applyPaymentUpdate(db, payment, "callback", { expectBookingId: booking.id });
    if (result.outcome === "confirmed") {
      background(() => processEmailOutbox(db, { appUrl: env().APP_URL, onlyBookingId: booking.id, limit: 1 }));
    }
    const view = await getBookingStatusForUser(db, user.id, booking.id);
    return json({ booking: view });
  } catch (e) {
    return errorResponse(e);
  }
}
