import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

/** A titled home page section with an optional "see all" link. */
export function HomeSection({
  id,
  title,
  subtitle,
  seeAll,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  seeAll?: { href: Route; label: string };
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={id} className="font-display text-4xl tracking-wide">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
        </div>
        {seeAll && (
          <Link
            href={seeAll.href}
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2"
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
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border px-6 py-12 text-center text-muted">
      <p>{children}</p>
      {action}
    </div>
  );
}
