"use client";

import { Sparkles } from "lucide-react";
import { useEffects } from "@/components/effects/effects-provider";

export function EffectsToggle() {
  const { effectsOn, setEffectsOn, reducedMotion } = useEffects();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={effectsOn && !reducedMotion}
      disabled={reducedMotion}
      onClick={() => setEffectsOn(!effectsOn)}
      className="inline-flex items-center gap-2 rounded-full border border-gold/25 px-3 py-2 text-xs font-bold text-mist transition hover:border-gold/60 hover:text-gold-bright disabled:opacity-60"
    >
      <Sparkles className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
      Sparkle effects: {reducedMotion ? "off (reduced motion)" : effectsOn ? "on" : "off"}
    </button>
  );
}
