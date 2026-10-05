import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/home-section";
import { MediaCard } from "@/components/media-card";
import { type SearchParams, param } from "@/lib/search-params";
import { apiGetAsViewer, requireMember } from "@/lib/server-api";
import type { Recommendation } from "@/lib/types";

export const metadata: Metadata = { title: "For you", robots: { index: false } };

interface ForYou {
  items: Recommendation[];
  basedOn: { reviews: number; listEntries: number };
}

const TYPES = [
  { value: null, label: "Everything" },
  { value: "anime", label: "Anime" },
  { value: "manga", label: "Manga" },
] as const;

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** Personal suggestions, each with the reasons it was picked. */
export default async function ForYouPage({ searchParams }: { searchParams: SearchParams }) {
  const requested = param((await searchParams).type);
  const type = requested === "anime" || requested === "manga" ? requested : null;

  // Personal, so never cached (apiGetAsViewer skips the cache for signed-in members).
  // Requested alongside the sign-in check rather than after it.
  const [user, data] = await Promise.all([
    requireMember("/for-you"),
    apiGetAsViewer<ForYou>(`/api/recommendations?limit=24${type ? `&type=${type}` : ""}`),
  ]);
  const signals = data ? data.basedOn.reviews + data.basedOn.listEntries : 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-5xl tracking-wide sm:text-6xl">For you</h1>
        <p className="text-muted">
          {data && signals > 0 ? (
            <>
              Picked for {user.displayUsername ?? user.username} from your{" "}
              {plural(data.basedOn.reviews, "verdict", "verdicts")} and{" "}
              {plural(data.basedOn.listEntries, "list entry", "list entries")}, plus what members
              with similar taste loved.
            </>
          ) : (
            <>
              These are the club&apos;s popular, highly rated picks for now. Give a few titles your
              verdict or add them to your list, and this page will learn your taste.
            </>
          )}
        </p>
      </header>

      <nav aria-label="Show" className="flex gap-2">
        {TYPES.map((t) => {
          const active = t.value === type;
          return (
            <Link
              key={t.label}
              href={t.value ? `/for-you?type=${t.value}` : "/for-you"}
              aria-current={active ? "page" : undefined}
              scroll={false}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
                active
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-border bg-surface text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {!data ? (
        <EmptyState>
          We couldn&apos;t load your suggestions right now. Please try again in a moment.
        </EmptyState>
      ) : data.items.length === 0 ? (
        <EmptyState
          action={
            <Link
              href="/browse"
              className="rounded-full bg-accent px-5 py-2 font-semibold text-accent-ink"
            >
              Browse the catalog
            </Link>
          }
        >
          You&apos;ve seen everything we&apos;d suggest here. Impressive! Try the other tab, or
          browse for something new.
        </EmptyState>
      ) : (
        <section aria-labelledby="picks-heading">
          <h2 id="picks-heading" className="sr-only">
            Your suggestions
          </h2>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {data.items.map(({ media, reasons }) => (
              <li key={media.id} className="flex flex-col gap-2">
                <MediaCard media={media} />
                <ul
                  aria-label={`Why ${media.title.display}`}
                  className="flex flex-col gap-1 px-0.5"
                >
                  {reasons.slice(0, 2).map((reason) => (
                    <li key={reason} className="text-xs leading-snug text-muted">
                      <span aria-hidden="true" className="text-accent-text">
                        ●{" "}
                      </span>
                      {reason}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
