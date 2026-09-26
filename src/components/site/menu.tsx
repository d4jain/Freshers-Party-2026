"use client";

import { GlassWater, UtensilsCrossed, Wine } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Tabs } from "radix-ui";
import { ALCOHOL_NOTE, BAR, FOOD_MENU, MOCKTAILS, type MenuGroup, type MenuItem } from "@/config/menu";
import { cn } from "@/lib/utils";

/** Indian veg / non-veg mark. The group title also says it, so colour is never the only cue. */
function DietMark({ diet }: { diet: "veg" | "nonveg" }) {
  const veg = diet === "veg";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border-2",
        veg ? "border-[#4fbf6a]" : "border-[#e0604c]",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", veg ? "bg-[#4fbf6a]" : "bg-[#e0604c]")} />
    </span>
  );
}

function ItemTile({ name, image, wide }: MenuItem & { wide?: boolean }) {
  return (
    <li
      className={cn(
        "group relative aspect-[4/5] overflow-hidden rounded-2xl border border-gold/15 bg-ink-3",
        wide && "lg:aspect-[4/3]",
      )}
    >
      {image && (
        <Image
          src={image}
          alt=""
          fill
          sizes="(min-width: 1280px) 200px, (min-width: 1024px) 16vw, (min-width: 640px) 24vw, 46vw"
          quality={70}
          className="object-cover transition-transform duration-[1.2s] ease-[var(--ease-lux)] group-hover:scale-105"
        />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,7,13,0)_45%,rgba(9,7,13,0.92)_100%)]" />
      <p className="absolute inset-x-0 bottom-0 p-3 font-display text-lg leading-tight text-ivory sm:p-4 sm:text-xl">{name}</p>
    </li>
  );
}

/**
 * Desktop: groups sit on a 6-column grid and span one column per item, so
 * small groups pair up on a row (3 + 3, 2 + 2, 4 + 1) instead of leaving gaps.
 * Static class maps keep Tailwind able to see every class.
 */
const SPAN = ["", "lg:col-span-1", "lg:col-span-2", "lg:col-span-3", "lg:col-span-4", "lg:col-span-5", "lg:col-span-6"];
const COLS = ["", "lg:grid-cols-1", "lg:grid-cols-2", "lg:grid-cols-3", "lg:grid-cols-4", "lg:grid-cols-5", "lg:grid-cols-6"];

function TileGroup({ group, wide }: { group: MenuGroup; wide?: boolean }) {
  const n = Math.min(group.items.length, 6);
  const id = `menu-${group.title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={SPAN[n]}>
      <h4 id={id} className="mb-4 flex items-center gap-2.5 text-sm font-bold tracking-[0.18em] text-gold uppercase">
        {group.diet && <DietMark diet={group.diet} />}
        {group.title}
      </h4>
      <ul className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", COLS[n])}>
        {group.items.map((item) => (
          <ItemTile key={item.name} {...item} wide={wide} />
        ))}
      </ul>
    </section>
  );
}

function BarCard({ group }: { group: MenuGroup }) {
  return (
    <li className="card flex overflow-hidden">
      {group.image && (
        <div className="relative w-28 shrink-0 sm:w-32">
          <Image src={group.image} alt="" fill sizes="8rem" quality={70} className="object-cover" />
        </div>
      )}
      <div className="min-w-0 p-4 sm:p-5">
        <h4 className="font-display text-2xl text-gold">{group.title}</h4>
        <ul className="mt-2 space-y-1 text-[0.95rem] text-ivory">
          {group.items.map((item) => (
            <li key={item.name}>{item.name}</li>
          ))}
        </ul>
      </div>
    </li>
  );
}

const TAB =
  "inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-sm font-bold text-mist transition-colors hover:text-gold-bright data-[state=active]:bg-gold data-[state=active]:text-ink";

export function Menu() {
  return (
    <Tabs.Root defaultValue="food">
      <Tabs.List aria-label="Menu" className="mb-10 inline-flex gap-1 rounded-full border border-gold/25 bg-ink-2 p-1">
        <Tabs.Trigger value="food" className={TAB}>
          <UtensilsCrossed className="h-4 w-4" aria-hidden="true" /> Food
        </Tabs.Trigger>
        <Tabs.Trigger value="drinks" className={TAB}>
          <GlassWater className="h-4 w-4" aria-hidden="true" /> Drinks
        </Tabs.Trigger>
      </Tabs.List>

      {/* Both panels stay in the HTML (search engines, no-JS); the inactive one is just hidden. */}
      <Tabs.Content
        value="food"
        forceMount
        className="grid gap-x-3 gap-y-10 outline-none data-[state=inactive]:hidden lg:grid-cols-6"
      >
        {FOOD_MENU.map((group) => (
          <TileGroup key={group.title} group={group} />
        ))}
      </Tabs.Content>

      <Tabs.Content value="drinks" forceMount className="space-y-12 outline-none data-[state=inactive]:hidden">
        <TileGroup group={MOCKTAILS} wide />
        <section aria-labelledby="menu-bar">
          <h4 id="menu-bar" className="mb-4 flex items-center gap-2.5 text-sm font-bold tracking-[0.18em] text-gold uppercase">
            <Wine className="h-4 w-4" aria-hidden="true" /> The bar
          </h4>
          <p className="mb-5 max-w-2xl rounded-2xl border border-gold/20 bg-ink-2 px-4 py-3 text-sm text-mist" role="note">
            {ALCOHOL_NOTE}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BAR.map((group) => (
              <BarCard key={group.title} group={group} />
            ))}
          </ul>
        </section>
      </Tabs.Content>

      <p className="mt-8 text-xs text-muted">
        Photos are illustrative images from Wikimedia Commons — not the venue’s food or drinks.{" "}
        <Link href="/credits" className="underline underline-offset-4 hover:text-gold-bright">
          Photo credits
        </Link>
        .
      </p>
    </Tabs.Root>
  );
}
