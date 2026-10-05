import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { AnimeHeading } from "./anime-heading";

/** A titled home page section with an optional "see all" link. */
export function HomeSection({
  id,
  title,
  jp,
  subtitle,
  seeAll,
  children,
}: {
  id: string;
  title: string;
  /** The Japanese (or Korean, Chinese) watermark behind the title. */
  jp: string;
  subtitle?: string;
  seeAll?: { href: Route; label: string };
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <AnimeHeading as="h2" id={id} jp={jp} className="text-4xl">
            {title}
          </AnimeHeading>
          {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
        </div>
        {seeAll && (
          <Link
            href={seeAll.href}
            className="btn-comic rounded-full bg-surface px-4 py-2 text-sm font-semibold"
          >
            {seeAll.label} <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Shown when a section has nothing yet, or the API couldn't be reached. */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-border px-6 py-12 text-center text-muted">
      <p>{children}</p>
      {action}
    </div>
  );
}
