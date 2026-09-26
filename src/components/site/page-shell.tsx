import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SiteFooter } from "./footer";
import { SiteNav } from "./nav";

/** Inner pages: solid nav, atmospheric backdrop, footer. */
export function PageShell({
  children,
  width = "max-w-3xl",
  className,
}: {
  children: ReactNode;
  width?: string;
  className?: string;
}) {
  return (
    <>
      <SiteNav solid />
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(60%_40%_at_10%_0%,rgba(116,69,204,0.22),transparent_70%),radial-gradient(50%_35%_at_100%_10%,rgba(58,85,216,0.16),transparent_70%)]" />
      </div>
      <main id="main" className={cn("mx-auto w-full px-4 pt-28 pb-20 sm:px-6 lg:pt-32", width, className)}>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}

export function PageTitle({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-8">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="display mt-3 text-[clamp(2.4rem,9vw,4.5rem)] text-ivory">{title}</h1>
      {children && <div className="mt-4 max-w-2xl text-mist">{children}</div>}
    </header>
  );
}
