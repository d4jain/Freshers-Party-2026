import { eq } from "drizzle-orm";
import { requireUserApi } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { coupons } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { assertSameOrigin, errorResponse, json, readJson, tooManyRequests } from "@/lib/http";
import { priceBooking } from "@/lib/pricing";
import { rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { pricePreviewSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Itemised price preview (including coupon). Informational only: checkout
 * recomputes everything and enforces coupon usage limits transactionally.
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUserApi(req);
    const db = getDb();
    const rl = await rateLimit(db, `preview:${user.id}`, 30, 60);
    if (!rl.allowed) return tooManyRequests(rl.resetAt);

    const input = pricePreviewSchema.parse(await readJson(req));
    const settings = await getSettings(db);
    if (input.quantityTotal > settings.maxGroupSize) {
      throw new AppError("GROUP_TOO_LARGE", `You can book up to ${settings.maxGroupSize} people in one booking.`);
    }
    let coupon = null;
    if (input.couponCode) {
      const [c] = await db.select().from(coupons).where(eq(coupons.code, input.couponCode)).limit(1);
      if (!c) throw new AppError("COUPON_NOT_FOUND", "That coupon code isn’t valid.");
      coupon = c;
    }
    const priced = priceBooking({
      quantity: input.quantityTotal,
      unitPricePaise: settings.unitPricePaise,
      compareAtPricePaise: settings.compareAtPricePaise,
      bookingFeePaise: settings.bookingFeePaise,
      bookingFeeLabel: settings.bookingFeeLabel,
      coupon,
      now: new Date(),
    });
    if (!priced.ok) throw new AppError(priced.code, priced.message);
    return json({ breakdown: priced.breakdown });
  } catch (e) {
    return errorResponse(e);
  }
}
