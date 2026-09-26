"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { ALCOHOL_NOTE, BAR, FOOD_MENU, MOCKTAILS, type MenuGroup } from "@/config/menu";
import { cn } from "@/lib/utils";

export type MenuKind = "food" | "drinks";

/** Indian veg / non-veg mark. The group title also says it, so colour is never the only cue. */
function DietMark({ diet }: { diet: "veg" | "nonveg" }) {
  const veg = diet === "veg";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border-2",
        veg ? "border-[#4fbf6a]" : "border-[#e0604c]",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", veg ? "bg-[#4fbf6a]" : "bg-[#e0604c]")} />
    </span>
  );
}

function Group({ group }: { group: MenuGroup }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 text-[0.7rem] font-bold tracking-[0.22em] text-gold uppercase">
        {group.diet && <DietMark diet={group.diet} />}
        {group.title}
      </h3>
      <ul className="mt-3 space-y-1.5">
        {group.items.map((item) => (
          <li key={item.name} className="font-display text-xl leading-snug text-ivory sm:text-[1.35rem]">
            {item.name}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FoodMenu() {
  return (
    <div className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
      {FOOD_MENU.map((g) => (
        <Group key={g.title} group={g} />
      ))}
    </div>
  );
}

function DrinksMenu() {
  return (
    <div className="space-y-8">
      <Group group={MOCKTAILS} />
      <div className="border-t border-gold/15 pt-7">
        <p className="font-display text-3xl text-gold italic">The bar</p>
        <p className="mt-2 text-sm text-muted">{ALCOHOL_NOTE}</p>
        <div className="mt-6 grid gap-x-10 gap-y-7 sm:grid-cols-2">
          {BAR.map((g) => (
            <Group key={g.title} group={g} />
          ))}
        </div>
      </div>
    </div>
  );
}

const COPY: Record<MenuKind, { eyebrow: string; title: string; description: string }> = {
  food: { eyebrow: "Unlimited", title: "Food menu", description: "Starters, mains, staples and dessert." },
  drinks: { eyebrow: "Unlimited", title: "Drinks menu", description: "Mocktails and the bar." },
};

/** Opens the food or drinks menu as a popup. `children` is the trigger. */
export function MenuDialog({ kind, children }: { kind: MenuKind; children: ReactNode }) {
  const copy = COPY[kind];
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-ink/75 backdrop-blur-sm data-[state=open]:animate-fade-in motion-reduce:animate-none" />
        <Dialog.Content
          data-no-glitter
          className="fixed inset-x-3 top-1/2 z-[61] mx-auto flex max-h-[88dvh] max-w-2xl -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-gold/30 bg-ink-2 shadow-[0_30px_120px_-30px_rgba(215,183,119,0.45)] outline-none data-[state=open]:animate-pop-in motion-reduce:animate-none"
        >
          <header className="flex items-start justify-between gap-4 border-b border-gold/15 px-6 pt-6 pb-5 sm:px-8">
            <div>
              <p className="eyebrow">{copy.eyebrow}</p>
              <Dialog.Title className="display mt-2 text-4xl text-ivory sm:text-5xl">{copy.title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-mist">{copy.description}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold/30 text-ivory hover:border-gold hover:text-gold-bright"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>
          <div className="overflow-y-auto overscroll-contain px-6 py-7 sm:px-8">
            {kind === "food" ? <FoodMenu /> : <DrinksMenu />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
