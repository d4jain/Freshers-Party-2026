import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Manrope, Pinyon_Script } from "next/font/google";
import { EffectsProvider } from "@/components/effects/effects-provider";
import { GlitterLayer } from "@/components/effects/glitter-layer";
import { SiteAnalytics } from "@/components/site/analytics";
import { EVENT_FACTS } from "@/config/event";
import "./globals.css";

const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-bodoni",
  display: "swap",
});
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const pinyon = Pinyon_Script({ subsets: ["latin"], weight: "400", variable: "--font-pinyon", display: "swap" });

const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const description =
  "Freshers’ Party 2026 for Bennett University students — 1 October 2026 at Rubarru, Advant Navis Park, Noida. Unlimited food + unlimited drinks. Party, dance, games. ₹2,199 per person.";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "Freshers’ Party 2026 — Your first unforgettable night", template: "%s · Freshers’ Party 2026" },
  description,
  applicationName: EVENT_FACTS.name,
  openGraph: {
    type: "website",
    title: "Freshers’ Party 2026",
    description,
    siteName: EVENT_FACTS.name,
    locale: "en_IN",
  },
  twitter: { card: "summary_large_image", title: "Freshers’ Party 2026", description },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#09070D",
  colorScheme: "dark",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" data-scroll-behavior="smooth" className={`${bodoni.variable} ${manrope.variable} ${pinyon.variable}`}>
      <body className="min-h-dvh antialiased">
        <noscript>
          {/* Without JavaScript, show content that would otherwise fade in. */}
          <style>{`[style*="opacity:0"]{opacity:1!important;transform:none!important;filter:none!important}`}</style>
        </noscript>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-full focus:bg-gold focus:px-4 focus:py-2 focus:font-bold focus:text-ink"
        >
          Skip to content
        </a>
        <EffectsProvider>
          {children}
          <GlitterLayer />
        </EffectsProvider>
        <SiteAnalytics />
      </body>
    </html>
  );
}
