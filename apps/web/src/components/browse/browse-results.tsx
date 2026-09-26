"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { type Filters, PAGE_SIZE, RESULTS_GRID, mediaApiPath } from "@/lib/browse";
import type { MediaSummary, Page } from "@/lib/types";

import { MediaCard } from "../media-card";

/**
 * The first page comes from the server; more load as the member nears the end of the
 * grid (or presses "Load more", which also works without scrolling or a mouse).
 */
export function BrowseResults({
  filters,
  initial,
}: {
  filters: Filters;
  initial: Page<MediaSummary>;
}) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(mediaApiPath(filters, PAGE_SIZE, cursor));
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as Page<MediaSummary>;
      // A title can move between pages if its popularity changed meanwhile.
      setItems((current) => {
        const seen = new Set(current.map((m) => m.id));
        return [...current, ...page.items.filter((m) => !seen.has(m.id))];
      });
      setCursor(page.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [cursor, filters]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !cursor || failed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [cursor, failed, loadMore]);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-8">
      {/* Keeps the heading outline in order (h1 page title, then h3 card titles). */}
      <h2 className="sr-only">Results</h2>
      <ul className={RESULTS_GRID}>
        {items.map((media, index) => (
          <li key={media.id} className="card-in">
            <MediaCard media={media} priority={index < 6} />
          </li>
        ))}
      </ul>

      <div ref={sentinelRef} className="flex flex-col items-center gap-3">
        <p role="status" className="text-sm text-muted">
          {loading
            ? "Loading more…"
            : failed
              ? "Couldn't load more titles."
              : cursor
                ? `Showing ${String(items.length)} titles`
                : `That's all ${String(items.length)} ${items.length === 1 ? "title" : "titles"}.`}
        </p>
        {cursor && !loading && (
          <button
            type="button"
            onClick={() => void loadMore()}
            className="rounded-full border border-border px-6 py-2.5 font-semibold hover:bg-surface-2"
          >
            {failed ? "Try again" : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}
