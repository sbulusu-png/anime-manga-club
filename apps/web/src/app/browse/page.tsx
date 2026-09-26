import type { Metadata } from "next";
import Link from "next/link";

import { BrowseResults } from "@/components/browse/browse-results";
import { DiscoverMore } from "@/components/browse/discover-more";
import { FilterBar } from "@/components/browse/filter-bar";
import { EmptyState } from "@/components/home-section";
import { PAGE_SIZE, hasFilters, mediaApiPath, parseFilters, toSearchParams } from "@/lib/browse";
import type { SearchParams } from "@/lib/search-params";
import { TAGS, apiGet } from "@/lib/server-api";
import type { MediaSummary, Page } from "@/lib/types";

export const metadata: Metadata = {
  title: "Browse anime and manga",
  description: "Search and filter every anime and manga in the club's catalog.",
};

export default async function BrowsePage({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseFilters(await searchParams);
  const [first, genres] = await Promise.all([
    apiGet<Page<MediaSummary>>(mediaApiPath(filters, PAGE_SIZE), 60, [TAGS.mediaLists]),
    apiGet<{ genres: string[] }>("/api/media/genres", 3600),
  ]);
  // A new search starts a fresh list (and a fresh infinite scroll).
  const resultsKey = toSearchParams(filters).toString();
  // Short result lists may just mean the club hasn't imported the title yet.
  const offerDiscover = filters.q.length >= 2 && first !== null && first.nextCursor === null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <header>
        <h1 className="font-display text-5xl tracking-wide sm:text-6xl">Browse</h1>
        <p className="mt-1 text-muted">
          Every anime and manga in the club&apos;s catalog. Filters stay in the address, so you can
          share a search.
        </p>
      </header>

      <FilterBar filters={filters} genres={genres?.genres ?? []} />

      {!first ? (
        <EmptyState>
          We couldn&apos;t load titles right now. Please try again in a moment.
        </EmptyState>
      ) : first.items.length === 0 ? (
        <EmptyState
          action={
            hasFilters(filters) ? (
              <Link
                href="/browse"
                className="rounded-full border border-border px-5 py-2 font-semibold text-ink hover:bg-surface-2"
              >
                Clear filters
              </Link>
            ) : undefined
          }
        >
          {filters.q
            ? `Nothing in the catalog matches “${filters.q}” with these filters.`
            : "Nothing matches these filters."}
        </EmptyState>
      ) : (
        <BrowseResults key={resultsKey} filters={filters} initial={first} />
      )}

      {offerDiscover && (
        <DiscoverMore
          key={`discover-${resultsKey}`}
          q={filters.q}
          type={filters.type}
          knownIds={first.items.map((m) => m.id)}
        />
      )}
    </div>
  );
}
