import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
};

/** Labelled input with error/hint wiring (aria-invalid + aria-describedby). */
export function Field({ label, error, hint, optional, className, id, ...rest }: Props) {
  const auto = useId();
  const inputId = id ?? auto;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="field-label">
        {label}
        {optional && <span className="ml-1 font-normal text-muted">(optional)</span>}
      </label>
      <input id={inputId} className="field" aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
      {hint && !error && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormAlert({ tone = "error", children }: { tone?: "error" | "info" | "success"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm",
        tone === "error" && "border-danger/40 bg-danger/10 text-[#ffd3cb]",
        tone === "info" && "border-gold/30 bg-gold/5 text-mist",
        tone === "success" && "border-success/40 bg-success/10 text-[#d6f5e0]",
      )}
    >
      {children}
    </div>
  );
}
