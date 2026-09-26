"use client";

import { MotionConfig } from "motion/react";
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { createLocalFlag, useMediaQuery } from "@/lib/hooks/client-state";

type EffectsContextValue = {
  /** Viewer preference (per-browser convenience, stored in localStorage). */
  effectsOn: boolean;
  setEffectsOn: (on: boolean) => void;
  reducedMotion: boolean;
  /** Pauses the glitter while overlays like checkout are open. */
  glitterSuppressed: boolean;
  setGlitterSuppressed: (on: boolean) => void;
};

const EffectsContext = createContext<EffectsContextValue | null>(null);
const effectsFlag = typeof window === "undefined" ? null : createLocalFlag("fp26-effects", true);

export function EffectsProvider({ children }: { children: ReactNode }) {
  const effectsOn = useSyncExternalStore(
    (cb) => effectsFlag?.subscribe(cb) ?? (() => {}),
    () => effectsFlag?.get() ?? true,
    () => true,
  );
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [glitterSuppressed, setGlitterSuppressed] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.effects = effectsOn && !reducedMotion ? "on" : "off";
  }, [effectsOn, reducedMotion]);

  const value = useMemo(
    () => ({
      effectsOn,
      setEffectsOn: (on: boolean) => effectsFlag?.set(on),
      reducedMotion,
      glitterSuppressed,
      setGlitterSuppressed,
    }),
    [effectsOn, reducedMotion, glitterSuppressed],
  );
  return (
    <EffectsContext.Provider value={value}>
      {/* Motion skips transform/layout animations for users who prefer reduced motion. */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </EffectsContext.Provider>
  );
}

export function useEffects() {
  const ctx = useContext(EffectsContext);
  if (!ctx) throw new Error("useEffects must be used inside EffectsProvider");
  return ctx;
}
