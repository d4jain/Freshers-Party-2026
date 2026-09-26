"use client";

import { Minus, Plus } from "lucide-react";
import { useId } from "react";

/** Accessible number stepper: a real <input type=number> with − / + buttons. */
export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  hint,
  error,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  hint?: string;
  error?: string;
}) {
  const id = useId();
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gold/35 text-gold transition hover:border-gold disabled:opacity-35"
          aria-label={`Decrease ${label.toLowerCase()}`}
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => {
            const n = e.target.value === "" ? min : Math.trunc(Number(e.target.value));
            if (Number.isFinite(n)) onChange(clamp(n));
          }}
          className="field w-20 text-center font-display text-2xl tabular-nums"
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? `${id}-desc` : undefined}
        />
        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gold/35 text-gold transition hover:border-gold disabled:opacity-35"
          aria-label={`Increase ${label.toLowerCase()}`}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {(hint || error) && (
        <p id={`${id}-desc`} className={error ? "field-error" : "field-hint"}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
