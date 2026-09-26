"use client";

import { ArrowUpRight, Dices, GlassWater, Music, PartyPopper, UtensilsCrossed, type LucideIcon } from "lucide-react";
import Image from "next/image";
import { AnimatedGroup } from "@/components/motion-primitives/animated-group";
import { STOCK, type StockImage } from "@/config/media";
import { MenuDialog, type MenuKind } from "./menu-dialog";
import { cn } from "@/lib/utils";

type Item = {
  title: string;
  body: string;
  icon: LucideIcon;
  image: StockImage;
  className: string;
  imageClass?: string;
  /** Card opens this menu as a popup. */
  menu?: MenuKind;
};

export function Experience({ drinksDetails }: { drinksDetails: string | null }) {
  const items: Item[] = [
    {
      title: "Unlimited Food",
      body: "Veg and non-veg starters, mains, staples and dessert.",
      menu: "food",
      icon: UtensilsCrossed,
      image: STOCK.buffet,
      className: "sm:col-span-2 lg:col-span-3 lg:row-span-2",
    },
    {
      title: "Unlimited Drinks",
      body: drinksDetails ?? "Mocktails and a full bar (21+ only).",
      menu: "drinks",
      icon: GlassWater,
      image: STOCK.mocktail,
      className: "lg:col-span-3",
      imageClass: "object-[50%_60%]",
    },
    {
      title: "Dance",
      body: "Skip the boring introduction. Meet your people on the dance floor.",
      icon: Music,
      image: STOCK.danceRed,
      className: "lg:col-span-3",
    },
    {
      title: "Party",
      body: "The night your batch becomes a crew.",
      icon: PartyPopper,
      image: STOCK.ledCeiling,
      className: "lg:col-span-4",
    },
    {
      title: "Games",
      body: "Games to break the ice. Line-up to be announced.",
      icon: Dices,
      image: STOCK.foosball,
      className: "lg:col-span-2",
    },
  ];

  return (
    <>
      <AnimatedGroup
        inView
        preset="blur-slide"
        as="ul"
        asChild="li"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:grid-rows-[repeat(3,minmax(15rem,auto))]"
        itemClassNames={items.map((i) => i.className)}
      >
        {items.map((item) => (
          <article
            key={item.title}
            className="group relative h-full min-h-[15rem] overflow-hidden rounded-[1.25rem] border border-gold/15"
          >
            <Image
              src={item.image.src}
              alt=""
              fill
              sizes="(min-width: 1024px) 50vw, (min-width: 640px) 50vw, 100vw"
              quality={70}
              className={cn(
                "object-cover opacity-70 transition-transform duration-[1.2s] ease-[var(--ease-lux)] group-hover:scale-105",
                item.imageClass,
              )}
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,7,13,0.1)_0%,rgba(9,7,13,0.55)_50%,rgba(9,7,13,0.95)_100%)]" />
            <div className="relative flex h-full flex-col justify-end p-5 sm:p-6">
              <span className="mb-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-gold/40 bg-ink/60 text-gold backdrop-blur">
                <item.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="display mt-8 text-4xl text-ivory">{item.title}</h3>
              <p className="mt-2 max-w-sm text-[0.95rem] leading-relaxed text-mist">{item.body}</p>
              {item.menu && (
                <span
                  aria-hidden="true"
                  className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-gold/45 bg-ink/60 px-3.5 py-1.5 text-xs font-bold text-gold-bright backdrop-blur transition-colors group-hover:border-gold group-hover:bg-gold group-hover:text-ink"
                >
                  View menu <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
            {item.menu && (
              <MenuDialog kind={item.menu}>
                {/* Whole card is the trigger; the chip above is its visible label. */}
                <button
                  type="button"
                  className="absolute inset-0 z-10 cursor-pointer rounded-[1.25rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright"
                  aria-label={`View the ${item.menu} menu`}
                />
              </MenuDialog>
            )}
          </article>
        ))}
      </AnimatedGroup>
      <p className="mt-4 text-xs text-muted">Photos are licensed stock mood images — not the venue and not this event.</p>
    </>
  );
}
