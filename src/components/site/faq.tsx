"use client";

import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/motion-primitives/accordion";

export type FaqItem = { q: string; a: ReactNode };

export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <Accordion
      className="divide-y divide-gold/15 border-y border-gold/15"
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {items.map((item, i) => (
        <AccordionItem key={item.q} value={i}>
          <h3>
            <AccordionTrigger className="flex w-full items-center justify-between gap-6 py-5 text-left">
              <span className="font-display text-xl text-ivory transition-colors group-hover:text-gold-bright sm:text-2xl">
                {item.q}
              </span>
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/35 text-gold transition-transform duration-300 group-data-[expanded]:rotate-45">
                <Plus className="h-4 w-4" aria-hidden="true" />
              </span>
            </AccordionTrigger>
          </h3>
          <AccordionContent>
            <div className="max-w-3xl pr-12 pb-6 leading-relaxed text-mist [&_a]:font-semibold [&_a]:text-gold [&_a]:underline [&_a]:underline-offset-4">
              {item.a}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
