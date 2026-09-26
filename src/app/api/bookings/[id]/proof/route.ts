import { and, eq } from "drizzle-orm";
import { requireUserApi } from "@/lib/auth/session";
import { MAX_PROOF_BYTES, submitPaymentProof } from "@/lib/booking/payment-proof";
import { getBookingStatusForUser } from "@/lib/booking/status";
import { getDb } from "@/lib/db";
import { bookings, paymentProofs } from "@/lib/db/schema";
import { background } from "@/lib/deps";
import { processEmailOutbox } from "@/lib/email/outbox";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { assertSameOrigin, errorResponse, json, tooManyRequests } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Buyer uploads their UPI payment screenshot + transaction id (multipart
 * form: `screenshot`, `utr`, optional `payerName`). Moves the booking to
 * "in review" for an organiser to verify.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/bookings/[id]/proof">) {
  try {
    assertSameOrigin(req);
    const user = await requireUserApi(req);
    const { id } = await ctx.params;
    const db = getDb();
    const rl = await rateLimit(db, `proof:${user.id}`, 10, 600);
    if (!rl.allowed) return tooManyRequests(rl.resetAt);

    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > MAX_PROOF_BYTES + 64_000) throw new AppError("PROOF_TOO_LARGE", "The screenshot must be under 8 MB.", 413);
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new AppError("INVALID_FORM", "Upload failed. Please try again.", 400);
    }
    const file = form.get("screenshot");
    if (!(file instanceof File) || file.size === 0)
      throw new AppError("PROOF_MISSING", "Attach a screenshot of your payment.", 400);
    if (file.size > MAX_PROOF_BYTES) throw new AppError("PROOF_TOO_LARGE", "The screenshot must be under 8 MB.", 413);

    await submitPaymentProof(db, {
      userId: user.id,
      bookingId: id,
      utr: String(form.get("utr") ?? ""),
      payerName: typeof form.get("payerName") === "string" ? String(form.get("payerName")) : null,
      file: Buffer.from(await file.arrayBuffer()),
    });
    background(() => processEmailOutbox(db, { appUrl: env().APP_URL, onlyBookingId: id, limit: 2 }));
    return json({ booking: await getBookingStatusForUser(db, user.id, id) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** The stored proof image — visible only to the booking owner and admins. */
export async function GET(req: Request, ctx: RouteContext<"/api/bookings/[id]/proof">) {
  try {
    const user = await requireUserApi(req);
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("NOT_FOUND", "Not found.", 404);
    const db = getDb();
    const where =
      user.role === "admin"
        ? eq(paymentProofs.bookingId, id)
        : and(eq(paymentProofs.bookingId, id), eq(bookings.userId, user.id));
    const [row] = await db
      .select({ image: paymentProofs.image, contentType: paymentProofs.contentType })
      .from(paymentProofs)
      .innerJoin(bookings, eq(bookings.id, paymentProofs.bookingId))
      .where(where)
      .limit(1);
    if (!row) throw new AppError("NOT_FOUND", "Not found.", 404);
    return new Response(new Uint8Array(row.image), {
      headers: {
        "Content-Type": row.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
