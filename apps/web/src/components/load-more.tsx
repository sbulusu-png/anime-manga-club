"use client";

import { useState } from "react";

import { statusLabel } from "@/lib/list";
import type { ListEntry, Page, Review, Viewer } from "@/lib/types";

import { MediaCard } from "./media-card";
import { ReviewCard } from "./review-card";

/**
 * Pages after the first. The first page is rendered on the server; these add the
 * rest in the browser when the member asks for more.
 */
// The caller names the item type; the hook only carries it through to `items`.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
function usePages<T>(path: string, initialCursor: string | null) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const separator = path.includes("?") ? "&" : "?";
      const res = await fetch(`${path}${separator}cursor=${encodeURIComponent(cursor)}`);
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as Page<T>;
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return { items, cursor, loading, failed, loadMore };
}

function MoreButton({
  label,
  loading,
  failed,
  onClick,
}: {
  label: string;
  loading: boolean;
  failed: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="rounded-full border border-border px-6 py-2.5 font-semibold hover:bg-surface-2 disabled:cursor-wait disabled:opacity-70"
      >
        {loading ? "Loading…" : failed ? "Try again" : label}
      </button>
      <p role="status" className="text-sm text-accent-text">
        {failed ? "Couldn't load more." : ""}
      </p>
    </div>
  );
}

/** More reviews for a feed or profile (`path` is the API query without a cursor). */
export function MoreReviews({
  path,
  initialCursor,
  viewer,
}: {
  path: `/api/reviews${string}`;
  initialCursor: string | null;
  viewer: Viewer;
}) {
  const { items, cursor, loading, failed, loadMore } = usePages<Review>(path, initialCursor);

  return (
    <>
      {items.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((review) => (
            <li key={review.id} className="card-in">
              <ReviewCard review={review} viewer={viewer} />
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <MoreButton
          label="More reviews"
          loading={loading}
          failed={failed}
          onClick={() => void loadMore()}
        />
      )}
    </>
  );
}

/** A list entry: the cover, plus where the member is with it. */
export function ListEntryCard({ entry }: { entry: ListEntry }) {
  const unit = entry.media.type === "anime" ? "ep" : "ch";
  return (
    <div className="flex flex-col gap-1.5">
      <MediaCard media={entry.media} />
      <p className="px-0.5 text-xs text-muted">
        <span className="font-semibold text-ink">
          {statusLabel(entry.status, entry.media.type)}
        </span>
        {entry.status !== "planning" &&
          ` · ${unit} ${String(entry.progress)}${entry.total ? `/${String(entry.total)}` : ""}`}
      </p>
    </div>
  );
}

export function MoreListEntries({
  path,
  initialCursor,
}: {
  path: `/api/list${string}`;
  initialCursor: string | null;
}) {
  const { items, cursor, loading, failed, loadMore } = usePages<ListEntry>(path, initialCursor);

  return (
    <>
      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map((entry) => (
            <li key={entry.media.id} className="card-in">
              <ListEntryCard entry={entry} />
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <MoreButton
          label="More titles"
          loading={loading}
          failed={failed}
          onClick={() => void loadMore()}
        />
      )}
    </>
  );
}
