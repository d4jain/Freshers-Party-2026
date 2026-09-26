"use client";

import { usePrefersReducedMotion } from "@/lib/hooks/client-state";

import { ArrowLeft, ArrowRight } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { Carousel, CarouselContent, CarouselItem, useCarousel } from "@/components/motion-primitives/carousel";
import { MOOD_CAPTION, MOOD_GALLERY } from "@/config/media";
import type { ApprovedMedia } from "@/lib/db/schema";

type Slide = {
  src: string;
  alt: string;
  caption: string;
  credit?: string;
  width?: number;
  height?: number;
  type: "image" | "video";
  poster?: string;
};

function Controls({ count }: { count: number }) {
  const { index, setIndex } = useCarousel();
  return (
    <div className="mt-5 flex items-center justify-between gap-4">
      <p className="text-sm font-semibold text-mist" aria-live="polite">
        {index + 1} <span className="text-muted">/ {count}</span>
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setIndex(Math.max(0, index - 1))}
          disabled={index === 0}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-gold/35 text-ivory transition hover:border-gold disabled:opacity-35"
          aria-label="Previous photo"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setIndex(Math.min(count - 1, index + 1))}
          disabled={index >= count - 1}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-gold/35 text-ivory transition hover:border-gold disabled:opacity-35"
          aria-label="Next photo"
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function SlideItem({ slide, i, count }: { slide: Slide; i: number; count: number }) {
  const { index } = useCarousel();
  const [failed, setFailed] = useState(false);
  const hidden = i !== index;
  return (
    <CarouselItem className="px-1">
      <figure
        aria-roledescription="slide"
        aria-label={`${i + 1} of ${count}`}
        aria-hidden={hidden}
        className="overflow-hidden rounded-[1.25rem] border border-gold/15 bg-ink-2"
      >
        <div className="relative aspect-[4/3] sm:aspect-[16/9]">
          {failed ? (
            <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_30%_30%,rgba(116,69,204,0.35),transparent_60%),#110d18] text-sm text-muted">
              Image unavailable
            </div>
          ) : slide.type === "video" ? (
            <video
              src={slide.src}
              poster={slide.poster}
              controls
              muted
              playsInline
              preload="none"
              className="h-full w-full object-cover"
              aria-label={slide.alt}
            />
          ) : (
            <Image
              src={slide.src}
              alt={slide.alt}
              fill
              sizes="(min-width: 1024px) 70vw, 100vw"
              quality={70}
              loading="lazy"
              unoptimized={/^https?:/.test(slide.src)}
              className="object-cover"
              onError={() => setFailed(true)}
            />
          )}
        </div>
        <figcaption className="flex flex-col gap-1 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-mist">{slide.caption}</span>
          {slide.credit && <span className="text-xs text-muted">Photo: {slide.credit}</span>}
        </figcaption>
      </figure>
    </CarouselItem>
  );
}

export function Gallery({ approved }: { approved: ApprovedMedia[] }) {
  const reduce = usePrefersReducedMotion();
  const slides: Slide[] =
    approved.length > 0
      ? approved.map((m) => ({ src: m.src, alt: m.alt, caption: m.caption, credit: m.credit, type: m.type, poster: m.poster }))
      : MOOD_GALLERY.map((m) => ({ src: m.src, alt: m.alt, caption: MOOD_CAPTION, credit: m.credit, type: "image" as const }));

  return (
    <div aria-roledescription="carousel" aria-label="Glimpses" role="region">
      {approved.length === 0 && (
        <p className="mb-6 max-w-2xl text-mist">
          Venue photos are on their way. Until the organisers share approved shots, here’s the mood we’re going for.
        </p>
      )}
      <Carousel>
        <CarouselContent transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 22 }}>
          {slides.map((slide, i) => (
            <SlideItem key={slide.src} slide={slide} i={i} count={slides.length} />
          ))}
        </CarouselContent>
        <Controls count={slides.length} />
      </Carousel>
    </div>
  );
}
