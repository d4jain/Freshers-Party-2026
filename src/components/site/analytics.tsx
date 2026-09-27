"use client";

import { Analytics } from "@vercel/analytics/next";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Vercel Web Analytics (cookieless page views; enable it in the Vercel
 * project's Analytics tab). Organiser/door pages aren't counted, and booking
 * or pass ids are replaced with [id] so no identifiers leave the site and
 * those pages group together in the report.
 */
export function SiteAnalytics() {
  // Production only: in development the package loads a debug script from
  // va.vercel-scripts.com, which our CSP (rightly) blocks. On Vercel the
  // script is served from this site's own /_vercel/insights path.
  if (process.env.NODE_ENV !== "production") return null;
  return (
    <Analytics
      beforeSend={(event) => {
        const url = new URL(event.url);
        if (/^\/(admin|staff)(\/|$)/.test(url.pathname)) return null;
        url.pathname = url.pathname.replace(UUID, "[id]");
        url.search = ""; // drop ?next=, ?ref= codes, reset tokens, etc.
        return { ...event, url: url.toString() };
      }}
    />
  );
}
