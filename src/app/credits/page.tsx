import fs from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { PageShell, PageTitle } from "@/components/site/page-shell";

export const metadata: Metadata = { title: "Photo & asset credits" };

type Credit = { file: string; title: string; creator: string | null; source: string; license: string; landing: string };

export default async function CreditsPage() {
  const raw = await fs.readFile(path.join(process.cwd(), "public/media/stock/credits.json"), "utf8").catch(() => "[]");
  const credits = JSON.parse(raw) as Credit[];
  return (
    <PageShell>
      <PageTitle eyebrow="Credits" title="Photo & asset credits">
        Mood photos are licensed stock (CC0). None of them show Rubarru or this event.
      </PageTitle>
      <ul className="space-y-3">
        {credits.map((c) => (
          <li key={c.file} className="card p-4 text-sm">
            <p className="text-ivory">{c.title}</p>
            <p className="text-muted">
              {c.creator ?? "Unknown creator"} · {c.source} · {c.license} ·{" "}
              <a href={c.landing} className="text-gold underline" target="_blank" rel="noopener noreferrer">
                source
              </a>
            </p>
          </li>
        ))}
      </ul>
      <div className="card mt-6 p-4 text-sm text-mist">
        <p>Fonts: Bodoni Moda, Manrope and Pinyon Script (SIL Open Font License) via Google Fonts, self-hosted by Next.js.</p>
        <p className="mt-2">Icons: Lucide (ISC). Animated components adapted from Motion Primitives (MIT).</p>
        <p className="mt-2">
          Decorative waves and textures are temporary hand-made SVGs pending organiser-supplied Haikei exports.
        </p>
      </div>
    </PageShell>
  );
}
