"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" className="btn-ghost !min-h-11 text-sm" onClick={() => window.print()}>
      <Printer className="h-4 w-4" aria-hidden="true" /> Print passes
    </button>
  );
}
