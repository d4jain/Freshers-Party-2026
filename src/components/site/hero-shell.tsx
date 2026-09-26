"use client";

import { Pause, Play } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useEffects } from "@/components/effects/effects-provider";
import { useSaveData } from "@/lib/hooks/client-state";
import type { StockImage } from "@/config/media";

type HeroVideo = { mp4?: string; webm?: string; poster?: string } | null;

/**
 * Full-bleed hero media with a visible pause control. The still image is
 * always rendered (fast LCP, works if video fails). A muted, looping,
 * inline video is layered on top only when one is configured and the viewer
 * hasn't asked for reduced motion or data saving.
 */
export function HeroShell({ image, video, children }: { image: StockImage; video: HeroVideo; children: ReactNode }) {
  const { reducedMotion } = useEffects();
  const [paused, setPaused] = useState(false);
  const saveData = useSaveData();
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const showVideo = Boolean(video && (video.mp4 || video.webm)) && !reducedMotion && !saveData && !videoFailed;
  const motionPaused = paused || reducedMotion;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause();
    else void v.play().catch(() => setPaused(true));
  }, [paused, showVideo]);

  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      data-ambient={motionPaused ? "paused" : "playing"}
      className="grain relative isolate flex min-h-[100svh] flex-col overflow-hidden"
    >
      <div className="absolute inset-0 -z-10">
        <Image
          src={image.src}
          alt={image.alt}
          fill
          priority
          sizes="100vw"
          quality={70}
          className="object-cover object-[50%_35%] opacity-80"
        />
        {showVideo && (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover opacity-80"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster={video?.poster ?? image.src}
            aria-hidden="true"
            onError={() => setVideoFailed(true)}
          >
            {video?.webm && <source src={video.webm} type="video/webm" />}
            {video?.mp4 && <source src={video.mp4} type="video/mp4" />}
          </video>
        )}
        {/* Legibility + mood overlays */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,7,13,0.55)_0%,rgba(9,7,13,0.25)_35%,rgba(9,7,13,0.85)_72%,#09070d_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(70%_55%_at_12%_18%,rgba(116,69,204,0.38),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_92%_10%,rgba(58,85,216,0.32),transparent_70%)]" />
        {/* Slow light beams (paused with the control / reduced motion) */}
        <div className="ambient-motion pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute top-[-30%] -left-1/4 h-[140%] w-1/2 origin-top animate-beam bg-[linear-gradient(180deg,rgba(155,123,224,0.35),transparent_65%)] blur-2xl" />
          <div className="absolute top-[-30%] -right-1/4 h-[140%] w-1/2 origin-top animate-beam bg-[linear-gradient(180deg,rgba(241,220,167,0.18),transparent_60%)] blur-2xl [animation-delay:-7s]" />
          {SPARKS.map((s, i) => (
            <svg
              key={i}
              viewBox="0 0 10 10"
              className="absolute animate-twinkle text-gold-bright"
              style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s` }}
            >
              <path d="M5 0 Q5.6 4.4 10 5 Q5.6 5.6 5 10 Q4.4 5.6 0 5 Q4.4 4.4 5 0Z" fill="currentColor" />
            </svg>
          ))}
        </div>
      </div>

      {children}

      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        disabled={reducedMotion}
        className="absolute right-4 bottom-5 z-10 inline-flex h-10 items-center gap-2 rounded-full border border-gold/30 bg-ink/60 px-3 text-xs font-bold text-mist backdrop-blur hover:text-gold-bright disabled:opacity-50 sm:right-6 lg:right-8"
        aria-pressed={motionPaused}
        aria-label={motionPaused ? "Play background motion" : "Pause background motion"}
      >
        {motionPaused ? (
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Pause className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">{motionPaused ? "Play motion" : "Pause motion"}</span>
      </button>
    </section>
  );
}

// Fixed positions (no Math.random at render → no hydration mismatch).
const SPARKS = [
  { x: 8, y: 22, size: 10, delay: 0 },
  { x: 22, y: 12, size: 6, delay: 1.2 },
  { x: 71, y: 18, size: 12, delay: 0.6 },
  { x: 86, y: 30, size: 7, delay: 2.1 },
  { x: 58, y: 8, size: 8, delay: 1.7 },
  { x: 93, y: 12, size: 5, delay: 0.3 },
  { x: 40, y: 26, size: 6, delay: 2.6 },
];
