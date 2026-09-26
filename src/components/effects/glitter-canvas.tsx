"use client";

import { useEffect, useRef } from "react";

/**
 * Gold/ivory glitter trail. One fixed canvas, a bounded particle pool and a
 * requestAnimationFrame loop that sleeps when no particles are alive.
 * pointer-events: none, so the real cursor and everything underneath keep
 * working. Mounted only for fine pointers with effects on and motion allowed.
 */
const POOL_SIZE = 90;
const COLORS = ["#d7b777", "#f1dca7", "#f7f0e6", "#e8c98a"];
const BLOCKED = "input, textarea, select, [contenteditable='true'], [data-no-glitter], iframe, [role='dialog']";

type Particle = {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  rot: number;
  spin: number;
};

export default function GlitterCanvas({ suppressed }: { suppressed: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const suppressedRef = useRef(suppressed);

  useEffect(() => {
    suppressedRef.current = suppressed;
  }, [suppressed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const pool: Particle[] = Array.from({ length: POOL_SIZE }, () => ({
      alive: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 0,
      size: 0,
      color: COLORS[0]!,
      rot: 0,
      spin: 0,
    }));
    let next = 0;
    let raf = 0;
    let running = false;
    let last = 0;
    let lastX = -1;
    let lastY = -1;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const spawn = (x: number, y: number) => {
      const p = pool[next]!;
      next = (next + 1) % POOL_SIZE;
      p.alive = true;
      p.x = x + (Math.random() - 0.5) * 6;
      p.y = y + (Math.random() - 0.5) * 6;
      p.vx = (Math.random() - 0.5) * 0.6;
      p.vy = Math.random() * 0.5 + 0.15;
      p.life = 0;
      p.maxLife = 520 + Math.random() * 420;
      p.size = 1.2 + Math.random() * 2.6;
      p.color = COLORS[(Math.random() * COLORS.length) | 0]!;
      p.rot = Math.random() * Math.PI;
      p.spin = (Math.random() - 0.5) * 0.02;
    };

    const drawSparkle = (p: Particle, alpha: number) => {
      const s = p.size * (0.6 + 0.4 * alpha);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(0, -s * 2);
      ctx.quadraticCurveTo(0, 0, s * 2, 0);
      ctx.quadraticCurveTo(0, 0, 0, s * 2);
      ctx.quadraticCurveTo(0, 0, -s * 2, 0);
      ctx.quadraticCurveTo(0, 0, 0, -s * 2);
      ctx.fill();
      ctx.restore();
    };

    const frame = (t: number) => {
      const dt = last ? Math.min(t - last, 48) : 16;
      last = t;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      ctx.globalCompositeOperation = "lighter";
      let alive = 0;
      for (const p of pool) {
        if (!p.alive) continue;
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.alive = false;
          continue;
        }
        alive++;
        p.x += p.vx * (dt / 16);
        p.y += p.vy * (dt / 16);
        p.vy += 0.004 * (dt / 16);
        p.rot += p.spin * dt;
        const k = p.life / p.maxLife;
        drawSparkle(p, k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      }
      ctx.globalCompositeOperation = "source-over";
      if (alive > 0 && !document.hidden) {
        raf = requestAnimationFrame(frame);
      } else {
        running = false;
        last = 0;
      }
    };

    const wake = () => {
      if (!running && !document.hidden) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      if (suppressedRef.current) return;
      const target = e.target as Element | null;
      if (target?.closest?.(BLOCKED)) {
        lastX = -1;
        return;
      }
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      const dist = lastX < 0 ? 12 : Math.hypot(dx, dy);
      if (dist < 10) return;
      const count = Math.min(3, Math.floor(dist / 12) + 1);
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 1 : i / (count - 1);
        spawn(lastX < 0 ? e.clientX : lastX + dx * t, lastY < 0 ? e.clientY : lastY + dy * t);
      }
      lastX = e.clientX;
      lastY = e.clientY;
      wake();
    };

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        running = false;
        last = 0;
      }
    };
    const onLeave = () => {
      lastX = -1;
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (suppressed) {
      const c = canvasRef.current;
      c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    }
  }, [suppressed]);

  return (
    <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-40" style={{ contain: "strict" }} />
  );
}
