"use client";

import { usePrefersReducedMotion } from "@/lib/hooks/client-state";

import type { ReactNode } from "react";
import { InView } from "@/components/motion-primitives/in-view";

/** Subtle scroll reveal built on the Motion Primitives InView component. */
export function Reveal({ children }: { children: ReactNode }) {
  // Same wrapper markup on server and client; only the motion differs.
  const reduce = usePrefersReducedMotion();
  return (
    <InView
      once
      viewOptions={{ once: true, margin: "0px 0px -12% 0px" }}
      variants={
        reduce
          ? { hidden: { opacity: 1 }, visible: { opacity: 1 } }
          : { hidden: { opacity: 0, y: 24, filter: "blur(6px)" }, visible: { opacity: 1, y: 0, filter: "blur(0px)" } }
      }
      transition={reduce ? { duration: 0 } : { duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </InView>
  );
}
