import type { Metadata, Route } from "next";
import Link from "next/link";

import { WeekEditor } from "@/components/admin/week-editor";
import { EmptyState } from "@/components/home-section";
import { type SearchParams, param } from "@/lib/search-params";
import { apiGetAsViewer, requireAdmin } from "@/lib/server-api";
import type { CurrentWeek } from "@/lib/types";
import { addWeeks, isMonday, weekLabel } from "@/lib/week";

export const metadata: Metadata = { title: "Club lead panel", robots: { index: false } };

const NAV = "rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2";

/** Where club leads pick each week's suggestions. */
export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const requested = param((await searchParams).week);
  const week = requested && isMonday(requested) ? requested : null;
  await requireAdmin(week ? `/admin?week=${week}` : "/admin");

  // Always fresh here: leads should see exactly what's saved.
  const [thisWeek, data] = await Promise.all([
    apiGetAsViewer<CurrentWeek>("/api/club/suggestions/current"),
    week ? apiGetAsViewer<CurrentWeek>(`/api/club/suggestions/current?week=${week}`) : null,
  ]);
  const shown = data ?? thisWeek;

  if (!thisWeek || !shown) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <EmptyState>
          We couldn&apos;t load the club&apos;s suggestions. Please try again in a moment.
        </EmptyState>
      </div>
    );
  }

  const relation =
    shown.weekStart === thisWeek.weekStart
      ? "This week"
      : shown.weekStart > thisWeek.weekStart
        ? "Upcoming"
        : "Past week";
  const link = (weekStart: string) =>
    (weekStart === thisWeek.weekStart ? "/admin" : `/admin?week=${weekStart}`) as Route;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-bold uppercase tracking-widest text-accent-text">
          Club lead panel
        </p>
        <h1 className="font-display text-5xl tracking-wide">{weekLabel(shown.weekStart)}</h1>
        <p className="text-muted">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold text-ink">
            {relation}
          </span>{" "}
          {relation === "This week" ? (
            <>
              Picks show on the home page and in the{" "}
              <Link href="/club" className="font-semibold text-link hover:underline">
                club archive
              </Link>{" "}
              straight away.
            </>
          ) : relation === "Upcoming" ? (
            "Only club leads can see these picks until the week starts."
          ) : (
            <>
              This week has passed; changes show in the{" "}
              <Link href="/club" className="font-semibold text-link hover:underline">
                club archive
              </Link>
              .
            </>
          )}
        </p>
      </header>

      <nav aria-label="Choose a week" className="flex flex-wrap gap-2">
        <Link href={link(addWeeks(shown.weekStart, -1))} className={NAV}>
          <span aria-hidden="true">← </span>Previous week
        </Link>
        {shown.weekStart !== thisWeek.weekStart && (
          <Link href="/admin" className={NAV}>
            This week
          </Link>
        )}
        <Link href={link(addWeeks(shown.weekStart, 1))} className={NAV}>
          Next week<span aria-hidden="true"> →</span>
        </Link>
      </nav>

      <WeekEditor key={shown.weekStart} weekStart={shown.weekStart} items={shown.items} />
    </div>
  );
}
