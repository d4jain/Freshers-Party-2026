"use client";

import { motion } from "motion/react";
import { useEffect, useRef } from "react";

/**
 * Decorative "sparkling bottle" pop that plays AFTER the server has created
 * (or safely reused) a payment order and BEFORE the UPI payment page opens.
 * ~1s: tilt → cork pop → gold burst → shimmer. A hard timeout guarantees
 * `onDone` fires even if an animation event never arrives. It never claims
 * the booking is confirmed.
 */
export const BOTTLE_POP_MS = 1000;

type Props = { onDone: () => void };

export function BottlePop({ onDone }: Props) {
  const done = useRef(false);
  const finish = useRef(onDone);

  useEffect(() => {
    finish.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!done.current) {
        done.current = true;
        finish.current();
      }
    }, BOTTLE_POP_MS);
    return () => window.clearTimeout(t);
  }, []);

  const particles = PARTICLES;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-ink/85 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      data-no-glitter
    >
      <div className="relative h-64 w-48" aria-hidden="true">
        {/* burst */}
        {particles.map((p) => (
          <motion.span
            key={p.id}
            className="absolute top-[18%] left-1/2"
            style={{ width: p.size, height: p.size, marginLeft: -p.size / 2 }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
            animate={{ x: p.x, y: p.y, opacity: [0, 1, 0], scale: [0.4, 1, 0.6] }}
            transition={{ duration: 0.6, delay: p.delay, ease: [0.22, 1, 0.36, 1] }}
          >
            {p.star ? (
              <svg viewBox="0 0 10 10" className="h-full w-full">
                <path d="M5 0 Q5.6 4.4 10 5 Q5.6 5.6 5 10 Q4.4 5.6 0 5 Q4.4 4.4 5 0Z" fill={p.color} />
              </svg>
            ) : (
              <span
                className="block h-full w-full rounded-full"
                style={{ background: p.color, boxShadow: `0 0 8px ${p.color}` }}
              />
            )}
          </motion.span>
        ))}

        {/* pop ring */}
        <motion.span
          className="absolute top-[14%] left-1/2 h-10 w-10 -translate-x-1/2 rounded-full border border-gold-bright"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 2.4], opacity: [0, 0.9, 0] }}
          transition={{ duration: 0.45, delay: 0.28 }}
        />

        {/* bottle */}
        <motion.svg
          viewBox="0 0 120 260"
          className="absolute inset-0 h-full w-full"
          initial={{ rotate: 0, scale: 0.85, opacity: 0, y: 12 }}
          animate={{ rotate: [0, -16, -12], scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          style={{ originX: "50%", originY: "90%" }}
        >
          <defs>
            <linearGradient id="glass" x1="0" x2="1">
              <stop offset="0" stopColor="#0f1a14" />
              <stop offset="0.45" stopColor="#1e3326" />
              <stop offset="0.55" stopColor="#2b4735" />
              <stop offset="1" stopColor="#0c140f" />
            </linearGradient>
            <linearGradient id="foil" x1="0" x2="1">
              <stop offset="0" stopColor="#a8894e" />
              <stop offset="0.5" stopColor="#f1dca7" />
              <stop offset="1" stopColor="#a8894e" />
            </linearGradient>
            <clipPath id="label-clip">
              <rect x="30" y="150" width="60" height="54" rx="6" />
            </clipPath>
          </defs>
          <path
            d="M50 40 h20 v40 c0 18 26 30 26 64 v96 c0 8 -6 14 -14 14 h-44 c-8 0 -14 -6 -14 -14 v-96 c0 -34 26 -46 26 -64z"
            fill="url(#glass)"
            stroke="#d7b777"
            strokeOpacity="0.35"
          />
          <path d="M50 40 h20 v34 c0 6 -20 6 -20 0z" fill="url(#foil)" />
          <rect x="30" y="150" width="60" height="54" rx="6" fill="#0b0810" stroke="#d7b777" strokeOpacity="0.7" />
          <text x="60" y="176" textAnchor="middle" fontFamily="Georgia, serif" fontSize="14" fill="#d7b777">
            FP
          </text>
          <text x="60" y="194" textAnchor="middle" fontFamily="Georgia, serif" fontSize="10" letterSpacing="2" fill="#f1dca7">
            ’26
          </text>
          {/* shimmer sweep */}
          <g clipPath="url(#label-clip)">
            <motion.rect
              x="0"
              y="140"
              width="18"
              height="80"
              fill="#fff6dd"
              opacity="0.55"
              initial={{ x: -10 }}
              animate={{ x: 110 }}
              transition={{ duration: 0.45, delay: 0.55, ease: "easeOut" }}
            />
          </g>
          {/* cork */}
          <motion.g
            initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
            animate={{ x: 46, y: -120, rotate: 220, opacity: [1, 1, 0] }}
            transition={{ duration: 0.5, delay: 0.26, ease: [0.16, 1, 0.3, 1] }}
            style={{ originX: "60px", originY: "32px" }}
          >
            <rect x="52" y="22" width="16" height="20" rx="5" fill="#c9a36a" />
            <rect x="50" y="36" width="20" height="6" rx="2" fill="url(#foil)" />
          </motion.g>
        </motion.svg>
      </div>
      <p className="mt-6 font-display text-2xl text-ivory">Preparing your payment…</p>
      <p className="mt-2 text-sm text-muted">Your places are held while you pay and upload proof.</p>
    </div>
  );
}

/** Deterministic pseudo-random spread (pure render; same burst every time). */
function rand(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const PARTICLES = Array.from({ length: 26 }, (_, i) => {
  const angle = -Math.PI / 2 + (rand(i, 1) - 0.5) * 1.9;
  const dist = 70 + rand(i, 2) * 120;
  return {
    id: i,
    x: Math.cos(angle) * dist + 18,
    y: Math.sin(angle) * dist,
    size: 3 + rand(i, 3) * 5,
    delay: 0.3 + rand(i, 4) * 0.12,
    color: ["#d7b777", "#f1dca7", "#f7f0e6"][i % 3],
    star: i % 4 === 0,
  };
});
