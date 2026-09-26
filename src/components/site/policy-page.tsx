import type { ReactNode } from "react";
import { PageShell, PageTitle } from "./page-shell";

/** `**bold**` → <strong>; everything else stays text (React escapes it). */
function inline(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 ? (
      <strong key={i} className="font-semibold text-ivory">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

/**
 * Renders organiser-approved text safely (never as HTML): paragraphs split by
 * blank lines, "## " lines as headings, and **bold**.
 */
export function PolicyText({ text }: { text: string }) {
  return (
    <div className="space-y-4 leading-relaxed text-mist">
      {text.split(/\n{2,}/).map((para, i) =>
        para.startsWith("## ") ? (
          <h2 key={i} className="pt-2 font-display text-2xl text-gold">
            {para.slice(3)}
          </h2>
        ) : (
          <p key={i} className="whitespace-pre-line">
            {inline(para)}
          </p>
        ),
      )}
    </div>
  );
}

export function PolicyPage({
  title,
  eyebrow,
  approved,
  version,
  children,
}: {
  title: string;
  eyebrow: string;
  approved: boolean;
  version: number;
  children: ReactNode;
}) {
  return (
    <PageShell>
      <PageTitle eyebrow={eyebrow} title={title} />
      {!approved && (
        <p
          className="mb-8 rounded-2xl border-2 border-dashed border-danger/60 bg-danger/10 px-4 py-3 text-sm font-semibold text-[#ffd3cb]"
          role="note"
        >
          DRAFT — not yet approved by the organisers and not binding. Live bookings stay closed until approved policies are
          published.
        </p>
      )}
      <article className="card p-6 sm:p-8">{children}</article>
      {approved && <p className="mt-4 text-xs text-muted">Policy version {version}.</p>}
    </PageShell>
  );
}
