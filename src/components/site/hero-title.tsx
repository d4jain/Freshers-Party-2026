"use client";

import { usePrefersReducedMotion } from "@/lib/hooks/client-state";

import { TextEffect } from "@/components/motion-primitives/text-effect";

/** Hero title entrance using the Motion Primitives TextEffect. */
export function HeroTitle() {
  const reduce = usePrefersReducedMotion();
  const speed = reduce ? 100 : 1;
  return (
    <h1 id="hero-title" className="display text-[clamp(3.6rem,17vw,11.5rem)] text-ivory">
      <TextEffect
        as="span"
        per="char"
        preset="fade-in-blur"
        speedReveal={1.4 * speed}
        speedSegment={0.6 * speed}
        className="block font-semibold"
      >
        Freshers’
      </TextEffect>
      <span className="flex flex-wrap items-baseline gap-x-[0.18em]">
        <TextEffect
          as="span"
          per="word"
          preset="fade-in-blur"
          delay={reduce ? 0 : 0.45}
          speedSegment={0.5 * speed}
          segmentWrapperClassName="text-gold pr-[0.06em]"
          className="block font-normal italic"
        >
          Party
        </TextEffect>
        <TextEffect
          as="span"
          per="word"
          preset="fade"
          delay={reduce ? 0 : 0.75}
          speedSegment={0.5 * speed}
          className="block text-[0.62em] font-normal tracking-normal text-ivory/90"
        >
          2026
        </TextEffect>
      </span>
    </h1>
  );
}
