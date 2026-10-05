import type { Metadata, Route } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/home-section";
import { SuggestionCard } from "@/components/suggestion-card";
import { type SearchParams, param } from "@/lib/search-params";
import { TAGS, apiGet, getCurrentUser } from "@/lib/server-api";
import type { ClubSuggestion, CurrentWeek, Page } from "@/lib/types";
import { weekLabel } from "@/lib/week";
import { AnimeHeading } from "@/components/anime-heading";

export const metadata: Metadata = {
  title: "Club suggestions",
  description: "What the club leads suggest each week, and every week before.",
};

const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";

/** Suggestions grouped by week, newest week first (the API already sorts them). */
function byWeek(items: ClubSuggestion[]) {
  const weeks = new Map<string, ClubSuggestion[]>();
  for (const item of items) weeks.set(item.weekStart, [...(weeks.get(item.weekStart) ?? []), item]);
  return [...weeks];
}

export default async function ClubPage({ searchParams }: { searchParams: SearchParams }) {
  const cursor = param((await searchParams).before);
  const [current, archive, user] = await Promise.all([
    apiGet<CurrentWeek>("/api/club/suggestions/current", 60, [TAGS.club]),
    apiGet<Page<ClubSuggestion>>(
      `/api/club/suggestions?limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      60,
      [TAGS.club],
    ),
    getCurrentUser(),
  ]);
  // This week has its own section, so the archive starts with the week before.
  const pastWeeks = archive
    ? byWeek(archive.items).filter(([week]) => week !== current?.weekStart)
    : [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <AnimeHeading jp="今週のおすすめ">Club suggestions</AnimeHeading>
          <p className="mt-1 text-muted">
            Every week the club leads pick a few titles for everyone to watch or read.
          </p>
        </div>
        {user?.role === "admin" && (
          <Link
            href="/admin"
            className="btn-comic rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-ink"
          >
            Pick this week&apos;s titles
          </Link>
        )}
      </header>

      {!cursor && (
        <section aria-labelledby="this-week" className="flex flex-col gap-4">
          <div>
            <h2 id="this-week" className="font-display text-4xl tracking-wide">
              This week
            </h2>
            {current && <p className="text-muted">{weekLabel(current.weekStart)}</p>}
          </div>
          {!current ? (
            <EmptyState>
              We couldn&apos;t load this week&apos;s picks. Please try again in a moment.
            </EmptyState>
          ) : current.items.length === 0 ? (
            <EmptyState>
              The club leads haven&apos;t picked this week&apos;s titles yet. Check back soon!
            </EmptyState>
          ) : (
            <ul className={GRID}>
              {current.items.map((suggestion) => (
                <li key={suggestion.id}>
                  <SuggestionCard suggestion={suggestion} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="past-weeks" className="flex flex-col gap-8">
        <h2 id="past-weeks" className="font-display text-4xl tracking-wide">
          {cursor ? "Older weeks" : "Past weeks"}
        </h2>
        {!archive ? (
          <EmptyState>We couldn&apos;t load past weeks right now.</EmptyState>
        ) : pastWeeks.length === 0 ? (
          <EmptyState>No past weeks yet. This is where earlier picks will collect.</EmptyState>
        ) : (
          pastWeeks.map(([week, items]) => (
            <section key={week} aria-label={weekLabel(week)} className="flex flex-col gap-3">
              <h3 className="text-lg font-bold">{weekLabel(week)}</h3>
              <ul className={GRID}>
                {items.map((suggestion) => (
                  <li key={suggestion.id}>
                    <SuggestionCard suggestion={suggestion} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        {archive?.nextCursor && (
          <Link
            href={`/club?before=${encodeURIComponent(archive.nextCursor)}` as Route}
            className="self-center rounded-full border border-border px-6 py-2.5 font-semibold hover:bg-surface-2"
          >
            Older weeks <span aria-hidden="true">→</span>
          </Link>
        )}
      </section>
    </div>
  );
}
