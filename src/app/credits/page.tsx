import fs from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { PageShell, PageTitle } from "@/components/site/page-shell";

export const metadata: Metadata = { title: "Photo & asset credits" };

type Credit = {
  file: string;
  title: string;
  creator: string | null;
  source: string;
  license: string;
  landing: string;
  note?: string;
};

async function readCredits(file: string): Promise<Credit[]> {
  const raw = await fs.readFile(path.join(process.cwd(), file), "utf8").catch(() => "[]");
  return JSON.parse(raw) as Credit[];
}

function CreditList({ credits }: { credits: Credit[] }) {
  return (
    <ul className="space-y-3">
      {credits.map((c) => (
        <li key={c.file} className="card p-4 text-sm">
          <p className="text-ivory">{c.title}</p>
          <p className="text-muted">
            {c.creator ?? "Unknown creator"} · {c.source} · {c.license}
            {c.note ? ` · ${c.note}` : ""} ·{" "}
            <a href={c.landing} className="text-gold underline" target="_blank" rel="noopener noreferrer">
              source
            </a>
          </p>
        </li>
      ))}
    </ul>
  );
}

export default async function CreditsPage() {
  const [stock, menu] = await Promise.all([
    readCredits("public/media/stock/credits.json"),
    readCredits("public/media/menu/credits.json"),
  ]);
  return (
    <PageShell>
      <PageTitle eyebrow="Credits" title="Photo & asset credits">
        Mood and menu photos are licensed images from Wikimedia Commons and other free sources. None of them show Rubarru, its
        food or this event.
      </PageTitle>
      <h2 className="mb-4 font-display text-2xl text-gold">Mood photos</h2>
      <CreditList credits={stock} />
      <h2 className="mt-10 mb-4 font-display text-2xl text-gold">Menu photos</h2>
      <p className="mb-4 text-sm text-muted">
        Resized and cropped for this site. CC BY / CC BY-SA images are used under those licences; follow each source link for the
        full licence.
      </p>
      <CreditList credits={menu} />
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
