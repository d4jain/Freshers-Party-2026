"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, type ReactNode } from "react";
import type { ActionResult } from "@/app/admin/actions";
import { cn } from "@/lib/utils";

type Action = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

/** Wraps a server action with pending state and an announced result message. */
export function ActionForm({
  action,
  children,
  submitLabel,
  className,
  submitClassName,
  confirm,
}: {
  action: Action;
  children?: ReactNode;
  submitLabel: string;
  className?: string;
  submitClassName?: string;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={cn("btn-gold !min-h-11 text-sm", submitClassName)}>
          {pending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {submitLabel}
        </button>
        <p role="status" aria-live="polite" className={cn("text-sm", state?.ok ? "text-success" : "text-danger")}>
          {state?.message}
        </p>
      </div>
    </form>
  );
}
