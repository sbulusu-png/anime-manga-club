import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { EmptyState } from "@/components/home-section";
import { ListEntryCard, MoreListEntries, MoreReviews } from "@/components/load-more";
import { Avatar, ReviewCard } from "@/components/review-card";
import { EvaluationBar } from "@/components/evaluation-bar";
import { statusLabel } from "@/lib/list";
import { type SearchParams, param } from "@/lib/search-params";
import { TAGS, apiGet, apiGetAsViewer, getCurrentUser, viewerOf } from "@/lib/server-api";
import type { ListEntry, ListStatus, Page, Profile, Review } from "@/lib/types";
import { AnimeHeading } from "@/components/anime-heading";

interface Props {
  params: Promise<{ username: string }>;
  searchParams: SearchParams;
}

const getProfile = cache(async (username: string) => {
  if (!/^[a-zA-Z0-9_.]{1,30}$/.test(username)) notFound();
  const profile = await apiGet<Profile>(`/api/users/${username}`, 60, [TAGS.profile(username)]);
  if (!profile) notFound();
  return profile;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { user } = await getProfile((await params).username);
  const name = user.displayUsername ?? user.username;
  return {
    title: `${name}'s profile`,
    description: `${name}'s reviews and list on Anime Manga Club.`,
  };
}

const TABS = ["reviews", "anime", "manga"] as const;
type Tab = (typeof TABS)[number];
const STATUSES: ListStatus[] = ["current", "completed", "paused", "dropped"];
const NUMBER = new Intl.NumberFormat("en");
const JOINED = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

export default async function ProfilePage({ params, searchParams }: Props) {
  const { username } = await params;
  const query = await searchParams;
  // Asked for together: neither waits on the other.
  const [profile, me] = await Promise.all([getProfile(username), getCurrentUser()]);
  const { user, stats } = profile;
  const name = user.displayUsername ?? user.username;
  const base = `/u/${user.username}`;

  const requestedTab = param(query.tab);
  const tab: Tab = TABS.find((t) => t === requestedTab) ?? "reviews";
  const requestedStatus = param(query.status);
  const status = STATUSES.find((s) => s === requestedStatus) ?? null;

  const viewer = viewerOf(me);
  const isMe = me?.username === user.username;

  const listCount = (type: "anime" | "manga") =>
    Object.values(stats.list[type]).reduce((sum, n) => sum + n, 0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-wrap items-center gap-5">
        <Avatar name={name} image={user.image} size={88} />
        <div className="flex min-w-0 flex-col gap-1">
          <AnimeHeading jp="プロフィール" className="text-4xl sm:text-5xl">
            {name}
          </AnimeHeading>
          <p className="text-muted">
            @{user.username} · Joined {JOINED.format(new Date(user.joinedAt))}
            {user.role === "admin" && (
              <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent-text">
                Club lead
              </span>
            )}
          </p>
        </div>
        {isMe && (
          <Link
            href="/settings"
            className="ml-auto rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2"
          >
            Account settings
          </Link>
        )}
      </header>

      <section aria-label="Stats" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <dl className="grid grid-cols-2 gap-3">
          <Stat label="Reviews" value={stats.reviews} />
          <Stat label="Likes received" value={stats.likesReceived} />
          <Stat label="Episodes watched" value={stats.episodesWatched} />
          <Stat label="Chapters read" value={stats.chaptersRead} />
        </dl>
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-muted">Verdicts given</h2>
          {stats.reviews > 0 ? (
            <EvaluationBar
              counts={stats.verdicts}
              noun="review"
              center={
                <>
                  <span className="font-display text-3xl leading-none tracking-wide">
                    {NUMBER.format(stats.reviews)}
                  </span>
                  <span className="text-xs text-muted">
                    {stats.reviews === 1 ? "review" : "reviews"}
                  </span>
                </>
              }
            />
          ) : (
            <p className="text-sm text-muted">No verdicts yet.</p>
          )}
          {stats.topGenres.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted">Favourite genres</h2>
              <ul className="flex flex-wrap gap-2">
                {stats.topGenres.map((genre) => (
                  <li key={genre}>
                    <Link
                      href={`/browse?genre=${encodeURIComponent(genre)}` as Route}
                      className="inline-block rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent-text hover:underline"
                    >
                      {genre}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <nav aria-label="Profile sections" className="flex gap-2 border-b border-border">
        {TABS.map((t) => {
          const label =
            t === "reviews"
              ? `Reviews (${String(stats.reviews)})`
              : `${t === "anime" ? "Anime" : "Manga"} list (${String(listCount(t))})`;
          return (
            <Link
              key={t}
              href={(t === "reviews" ? base : `${base}?tab=${t}`) as Route}
              aria-current={tab === t ? "page" : undefined}
              scroll={false}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
                tab === t
                  ? "border-accent text-ink"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {tab === "reviews" ? (
        <ReviewsTab username={user.username} viewer={viewer} name={name} />
      ) : (
        <ListTab
          username={user.username}
          type={tab}
          status={status}
          counts={stats.list[tab]}
          base={`${base}?tab=${tab}`}
          name={name}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd className="font-display text-4xl tracking-wide">{NUMBER.format(value)}</dd>
    </div>
  );
}

async function ReviewsTab({
  username,
  viewer,
  name,
}: {
  username: string;
  viewer: ReturnType<typeof viewerOf>;
  name: string;
}) {
  const path = `/api/reviews?user=${username}&limit=12` as const;
  const page = await apiGetAsViewer<Page<Review>>(path, 30, [TAGS.reviews]);
  if (!page) return <EmptyState>We couldn&apos;t load reviews right now.</EmptyState>;
  if (page.items.length === 0)
    return <EmptyState>{name} hasn&apos;t reviewed anything yet.</EmptyState>;

  return (
    <div className="flex flex-col gap-6">
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {page.items.map((review) => (
          <li key={review.id}>
            <ReviewCard review={review} viewer={viewer} />
          </li>
        ))}
      </ul>
      <MoreReviews key={path} path={path} initialCursor={page.nextCursor} viewer={viewer} />
    </div>
  );
}

async function ListTab({
  username,
  type,
  status,
  counts,
  base,
  name,
}: {
  username: string;
  type: "anime" | "manga";
  status: ListStatus | null;
  counts: Record<ListStatus, number>;
  base: string;
  name: string;
}) {
  const path =
    `/api/list?user=${username}&type=${type}${status ? `&status=${status}` : ""}&limit=24` as const;
  const page = await apiGet<Page<ListEntry>>(path, 30, [TAGS.profile(username)]);

  return (
    <div className="flex flex-col gap-6">
      <ul aria-label="Filter by status" className="flex flex-wrap gap-2">
        {[null, ...STATUSES].map((s) => {
          const active = s === status;
          const count = s ? counts[s] : Object.values(counts).reduce((a, b) => a + b, 0);
          return (
            <li key={s ?? "all"}>
              <Link
                href={(s ? `${base}&status=${s}` : base) as Route}
                aria-current={active ? "true" : undefined}
                scroll={false}
                className={`inline-block rounded-full border px-3 py-1.5 text-sm font-semibold ${
                  active
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-border bg-surface text-muted hover:text-ink"
                }`}
              >
                {s ? statusLabel(s, type) : "All"} ({count})
              </Link>
            </li>
          );
        })}
      </ul>

      {!page ? (
        <EmptyState>We couldn&apos;t load this list right now.</EmptyState>
      ) : page.items.length === 0 ? (
        <EmptyState>
          Nothing here yet. {name}&apos;s {type} list fills up as they add titles.
        </EmptyState>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {page.items.map((entry) => (
              <li key={entry.media.id}>
                <ListEntryCard entry={entry} />
              </li>
            ))}
          </ul>
          <MoreListEntries key={path} path={path} initialCursor={page.nextCursor} />
        </>
      )}
    </div>
  );
}
