"use client";

import dynamic from "next/dynamic";
import { useMediaQuery } from "@/lib/hooks/client-state";
import { useEffects } from "./effects-provider";

// Lazy: the canvas code only downloads on devices that will show it.
const GlitterCanvas = dynamic(() => import("./glitter-canvas"), { ssr: false });

export function GlitterLayer() {
  const { effectsOn, reducedMotion, glitterSuppressed } = useEffects();
  const finePointer = useMediaQuery("(hover: hover) and (pointer: fine)");
  if (!effectsOn || reducedMotion || !finePointer) return null;
  return <GlitterCanvas suppressed={glitterSuppressed} />;
}
