import { and, eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { requireUserApi } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { bookings, tickets } from "@/lib/db/schema";
import { ticketSigningSecret } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { eventTimingLabel, formatEventDate } from "@/lib/format";
import { errorResponse } from "@/lib/http";
import { getSettings } from "@/lib/settings";
import { formatManualCode, qrPayloadFor } from "@/lib/tickets/token";

export const dynamic = "force-dynamic";

/** Downloadable PNG pass. Owner-only; generated on demand, never cached publicly. */
export async function GET(req: Request, ctx: RouteContext<"/api/tickets/[id]/pass">) {
  try {
    const user = await requireUserApi(req);
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("NOT_FOUND", "Not found.", 404);
    const db = getDb();
    const [row] = await db
      .select({ t: tickets, b: bookings })
      .from(tickets)
      .innerJoin(bookings, eq(bookings.id, tickets.bookingId))
      .where(and(eq(tickets.id, id), eq(tickets.userId, user.id)))
      .limit(1);
    if (!row || row.b.status !== "confirmed" || row.t.status !== "valid")
      throw new AppError("NOT_FOUND", "Pass not available.", 404);
    const s = await getSettings(db);
    const qr = await QRCode.toDataURL(qrPayloadFor(ticketSigningSecret(), row.t.publicId), {
      margin: 1,
      width: 520,
      errorCorrectionLevel: "M",
      color: { dark: "#09070D", light: "#F7F0E6" },
    });

    const image = new ImageResponse(
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#09070D",
          color: "#F7F0E6",
          padding: 48,
          fontFamily: "serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            border: "2px solid #D7B777",
            borderRadius: 28,
            padding: 40,
            flex: 1,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, letterSpacing: 6, color: "#D7B777" }}>
            <span>ADMIT ONE</span>
            <span>
              PASS {row.t.ticketIndex} OF {row.b.quantityTotal}
            </span>
          </div>
          <div style={{ display: "flex", fontSize: 72, marginTop: 24 }}>Freshers’ Party 2026</div>
          <div style={{ display: "flex", fontSize: 26, marginTop: 8, color: "#CFC6B8" }}>
            {formatEventDate(s.eventDate)} · {eventTimingLabel(s.startsAt, s.endsAt)}
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#CFC6B8" }}>
            {s.venueName}, {s.venueBranch}
          </div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 36, gap: 40 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders plain <img> */}
            <img src={qr} width={420} height={420} alt="" style={{ borderRadius: 18 }} />
            <div style={{ display: "flex", flexDirection: "column", fontSize: 26, color: "#CFC6B8" }}>
              <span>Booking</span>
              <span style={{ fontSize: 40, color: "#F7F0E6" }}>{row.b.reference}</span>
              <span style={{ marginTop: 20 }}>Manual code</span>
              <span style={{ fontSize: 40, color: "#F1DCA7", letterSpacing: 4 }}>{formatManualCode(row.t.manualCode)}</span>
              <span style={{ marginTop: 28, fontSize: 20, maxWidth: 360 }}>
                Bennett University students only. Carry your college ID. One scan per pass.
              </span>
              {row.t.isDemo ? (
                <span style={{ marginTop: 16, fontSize: 28, color: "#FF9B8A" }}>DEMO — NOT VALID FOR ENTRY</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>,
      { width: 1080, height: 1080 },
    );
    const headers = new Headers(image.headers);
    headers.set("Cache-Control", "private, no-store");
    headers.set("Content-Disposition", `attachment; filename="freshers-2026-${row.b.reference}-pass-${row.t.ticketIndex}.png"`);
    return new Response(image.body, { status: 200, headers });
  } catch (e) {
    return errorResponse(e);
  }
}
