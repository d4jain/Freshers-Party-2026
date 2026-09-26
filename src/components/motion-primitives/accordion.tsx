"use client";
import { usePrefersReducedMotion } from "@/lib/hooks/client-state";
/**
 * Motion Primitives — Accordion (https://motion-primitives.com/docs/accordion),
 * added with `npx motion-primitives@0.1.0 add accordion`.
 *
 * Project adaptations:
 *  - Item context replaces `cloneElement` prop injection (React 19 typings).
 *  - Trigger/content are linked with aria-controls / aria-labelledby.
 *  - Content stays in the server-rendered HTML (crawlable, works before
 *    hydration) and is `inert` while collapsed instead of being unmounted.
 *  - Honours prefers-reduced-motion (instant open/close).
 */
import { motion, MotionConfig, type Transition, type Variant } from "motion/react";
import { cn } from "@/lib/utils";
import React, { createContext, useContext, useId, useState, type ReactNode } from "react";

type AccordionContextType = {
  expandedValue: React.Key | null;
  toggleItem: (value: React.Key) => void;
  variants?: { expanded: Variant; collapsed: Variant };
};

const AccordionContext = createContext<AccordionContextType | undefined>(undefined);
const ItemContext = createContext<{ value: React.Key; triggerId: string; contentId: string } | undefined>(undefined);

function useAccordion() {
  const context = useContext(AccordionContext);
  if (!context) throw new Error("useAccordion must be used within an Accordion");
  return context;
}

function useItem() {
  const context = useContext(ItemContext);
  if (!context) throw new Error("Accordion parts must be used within an AccordionItem");
  return context;
}

export type AccordionProps = {
  children: ReactNode;
  className?: string;
  transition?: Transition;
  variants?: { expanded: Variant; collapsed: Variant };
  expandedValue?: React.Key | null;
  onValueChange?: (value: React.Key | null) => void;
};

function Accordion({ children, className, transition, variants, expandedValue, onValueChange }: AccordionProps) {
  const [internal, setInternal] = useState<React.Key | null>(null);
  const current = expandedValue !== undefined ? expandedValue : internal;
  const toggleItem = (value: React.Key) => {
    const next = current === value ? null : value;
    if (onValueChange) onValueChange(next);
    else setInternal(next);
  };
  return (
    <MotionConfig transition={transition}>
      <div className={cn("relative", className)}>
        <AccordionContext.Provider value={{ expandedValue: current, toggleItem, variants }}>{children}</AccordionContext.Provider>
      </div>
    </MotionConfig>
  );
}

export type AccordionItemProps = { value: React.Key; children: ReactNode; className?: string };

function AccordionItem({ value, children, className }: AccordionItemProps) {
  const { expandedValue } = useAccordion();
  const isExpanded = value === expandedValue;
  const base = useId();
  return (
    <ItemContext.Provider value={{ value, triggerId: `${base}-trigger`, contentId: `${base}-content` }}>
      <div className={cn("overflow-hidden", className)} {...(isExpanded ? { "data-expanded": "" } : { "data-closed": "" })}>
        {children}
      </div>
    </ItemContext.Provider>
  );
}

export type AccordionTriggerProps = { children: ReactNode; className?: string };

function AccordionTrigger({ children, className }: AccordionTriggerProps) {
  const { toggleItem, expandedValue } = useAccordion();
  const { value, triggerId, contentId } = useItem();
  const isExpanded = value === expandedValue;
  return (
    <button
      id={triggerId}
      onClick={() => toggleItem(value)}
      aria-expanded={isExpanded}
      aria-controls={contentId}
      type="button"
      className={cn("group", className)}
      {...(isExpanded ? { "data-expanded": "" } : { "data-closed": "" })}
    >
      {children}
    </button>
  );
}

export type AccordionContentProps = { children: ReactNode; className?: string };

function AccordionContent({ children, className }: AccordionContentProps) {
  const { expandedValue, variants } = useAccordion();
  const { value, triggerId, contentId } = useItem();
  const reduce = usePrefersReducedMotion();
  const isExpanded = value === expandedValue;
  const combined = {
    expanded: { height: "auto", opacity: 1, ...variants?.expanded },
    collapsed: { height: 0, opacity: 0, ...variants?.collapsed },
  };
  return (
    <motion.div
      id={contentId}
      role="region"
      aria-labelledby={triggerId}
      initial={false}
      animate={isExpanded ? "expanded" : "collapsed"}
      variants={combined}
      transition={reduce ? { duration: 0 } : undefined}
      inert={!isExpanded}
      style={{ overflow: "hidden" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
