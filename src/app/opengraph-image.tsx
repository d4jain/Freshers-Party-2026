import { ImageResponse } from "next/og";

export const alt = "Freshers’ Party 2026 — 1 October 2026 · Rubarru, Advant Navis Park, Noida";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        background:
          "radial-gradient(60% 60% at 15% 10%, #3a2470 0%, rgba(9,7,13,0) 70%), radial-gradient(50% 50% at 95% 5%, #1d2b72 0%, rgba(9,7,13,0) 70%), #09070D",
        color: "#F7F0E6",
        fontFamily: "serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 24, letterSpacing: 8, color: "#D7B777" }}>BENNETT UNIVERSITY STUDENTS ONLY</div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 128, lineHeight: 1 }}>Freshers’</div>
        <div style={{ display: "flex", fontSize: 128, lineHeight: 1, color: "#D7B777", fontStyle: "italic" }}>Party 2026</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 30, color: "#CFC6B8" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span>Thursday, 1 October 2026</span>
          <span>Rubarru · Advant Navis Park, Noida</span>
        </div>
        <div style={{ display: "flex", fontSize: 64, color: "#F1DCA7" }}>₹2,199</div>
      </div>
    </div>,
    size,
  );
}
