import type { Metadata, Route } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/home-section";
import { MoreReviews } from "@/components/load-more";
import { ReviewCard } from "@/components/review-card";
import { type SearchParams, param } from "@/lib/search-params";
import { TAGS, apiGetAsViewer, getCurrentUser, viewerOf } from "@/lib/server-api";
import type { Page, Review } from "@/lib/types";

export const metadata: Metadata = {
  title: "Reviews",
  description: "What the club thinks: the newest and most liked reviews.",
};

const PERIODS = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
] as const;
type Period = (typeof PERIODS)[number]["value"];

const PILL = "inline-block rounded-full border px-4 py-1.5 text-sm font-semibold";
const pill = (active: boolean) =>
  `${PILL} ${active ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface text-muted hover:text-ink"}`;

export default async function ReviewsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const sort = param(query.sort) === "top" ? "top" : "recent";
  const period: Period = PERIODS.find((p) => p.value === param(query.period))?.value ?? "month";

  const path =
    sort === "top"
      ? (`/api/reviews?sort=top&period=${period}&limit=12` as const)
      : ("/api/reviews?sort=recent&limit=12" as const);
  const [page, user] = await Promise.all([
    apiGetAsViewer<Page<Review>>(path, 30, [TAGS.reviews]),
    getCurrentUser(),
  ]);
  const viewer = viewerOf(user);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <header>
        <h1 className="font-display text-5xl tracking-wide sm:text-6xl">Reviews</h1>
        <p className="mt-1 text-muted">
          What the club thinks. Open a title to give your own verdict.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <nav aria-label="Sort reviews" className="flex gap-2">
          <Link
            href="/reviews"
            aria-current={sort === "recent" ? "page" : undefined}
            className={pill(sort === "recent")}
          >
            Newest
          </Link>
          <Link
            href="/reviews?sort=top"
            aria-current={sort === "top" ? "page" : undefined}
            className={pill(sort === "top")}
          >
            Most liked
          </Link>
        </nav>
        {sort === "top" && (
          <nav aria-label="Time period" className="flex flex-wrap gap-2">
            {PERIODS.map((p) => (
              <Link
                key={p.value}
                href={`/reviews?sort=top&period=${p.value}` as Route}
                aria-current={period === p.value ? "page" : undefined}
                scroll={false}
                className={`rounded-full px-3 py-1 text-sm font-semibold ${
                  period === p.value ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {p.label}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {!page ? (
        <EmptyState>
          We couldn&apos;t load reviews right now. Please try again in a moment.
        </EmptyState>
      ) : page.items.length === 0 ? (
        <EmptyState
          action={
            <Link
              href="/browse"
              className="rounded-full bg-accent px-5 py-2 font-semibold text-accent-ink"
            >
              Find something to review
            </Link>
          }
        >
          {sort === "top" && period !== "all"
            ? "No liked reviews in this period yet."
            : "No reviews yet. Be the first member to share a verdict!"}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          <h2 className="sr-only">{sort === "top" ? "Most liked reviews" : "Newest reviews"}</h2>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {page.items.map((review) => (
              <li key={review.id}>
                <ReviewCard review={review} viewer={viewer} />
              </li>
            ))}
          </ul>
          <MoreReviews key={path} path={path} initialCursor={page.nextCursor} viewer={viewer} />
        </div>
      )}
    </div>
  );
}
