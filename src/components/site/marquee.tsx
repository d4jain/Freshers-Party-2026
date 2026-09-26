const WORDS = ["Unlimited Food", "Unlimited Drinks", "Party", "Dance", "Games", "One batch", "One dance floor"];

/** Decorative ticker; content duplicates the highlights so it's hidden from assistive tech. */
export function Marquee() {
  const row = (
    <span className="flex shrink-0 items-center gap-8 pr-8">
      {WORDS.map((w) => (
        <span key={w} className="flex items-center gap-8">
          <span className="font-display text-3xl text-ivory/85 italic sm:text-4xl">{w}</span>
          <svg viewBox="0 0 10 10" className="h-3 w-3 text-gold" aria-hidden="true">
            <path d="M5 0 Q5.6 4.4 10 5 Q5.6 5.6 5 10 Q4.4 5.6 0 5 Q4.4 4.4 5 0Z" fill="currentColor" />
          </svg>
        </span>
      ))}
    </span>
  );
  return (
    <div className="relative overflow-hidden border-y border-gold/15 bg-ink-2 py-5" aria-hidden="true">
      <div className="ambient-motion flex w-max animate-marquee motion-reduce:animate-none">
        {row}
        {row}
      </div>
    </div>
  );
}
