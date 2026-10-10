import type { Metadata, Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { EmptyState, HomeSection } from "@/components/home-section";
import { MediaCard, formatLabel } from "@/components/media-card";
import { ClubVerdict } from "@/components/media/club-verdict";
import { ListControl } from "@/components/media/list-control";
import { ReviewEditor } from "@/components/media/review-editor";
import { WhereTo } from "@/components/media/where-to";
import { Synopsis } from "@/components/media/synopsis";
import { ReviewCard } from "@/components/review-card";
import { SEASONS, STATUSES } from "@/lib/browse";
import { TAGS, apiGet, apiGetAsViewer, getCurrentUser, viewerOf } from "@/lib/server-api";
import type { ListEntry, MediaDetail, Page, Recommendation, Review } from "@/lib/types";
import { AnimeHeading } from "@/components/anime-heading";

interface Props {
  params: Promise<{ id: string }>;
}

// One request per page render, shared by generateMetadata and the page. Null when there's
// no such title: only the page itself calls notFound(). Metadata is streamed after the
// page has started, so throwing there made the browser re-render the whole layout.
const getTitle = cache(async (id: string) => {
  if (!/^\d{1,10}$/.test(id)) return null;
  const data = await apiGet<{ item: MediaDetail }>(`/api/media/${id}`, 300, [
    TAGS.title(id),
    TAGS.allTitles,
  ]);
  return data?.item ?? null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const media = await getTitle((await params).id);
  if (!media) return { title: "Title not found" };
  const description = media.synopsis ? `${media.synopsis.slice(0, 155).trimEnd()}…` : undefined;
  return {
    title: media.title.display,
    description,
    openGraph: {
      title: media.title.display,
      description,
      images: media.coverImageUrl ? [media.coverImageUrl] : [],
    },
  };
}

const labelOf = (options: readonly { value: string; label: string }[], value: string | null) =>
  value ? (options.find((o) => o.value === value)?.label ?? value) : null;

const NUMBER = new Intl.NumberFormat("en");

export default async function MediaPage({ params }: Props) {
  const { id } = await params;
  if (!/^\d{1,10}$/.test(id)) notFound();
  // Everything here needs only the id, so it's all requested at once rather than in
  // rounds (each round is a trip to the API and the database).
  const userPromise = getCurrentUser();
  const forMember = <T,>(path: `/api/${string}`) =>
    userPromise.then((user) => (user ? apiGetAsViewer<T>(path) : null));
  const [media, user, reviews, similar, mine, entry] = await Promise.all([
    getTitle(id),
    userPromise,
    apiGetAsViewer<Page<Review>>(`/api/reviews?mediaId=${id}&sort=top&limit=6`, 30, [TAGS.reviews]),
    apiGet<{ items: Recommendation[] }>(`/api/media/${id}/similar?limit=6`, 600),
    // The member's own review and list entry (only for signed-in members).
    forMember<{ item: Review | null }>(`/api/reviews/mine?mediaId=${id}`),
    forMember<{ item: ListEntry | null }>(`/api/list/${id}`),
  ]);
  if (!media) notFound();
  const viewer = viewerOf(user);

  const season = labelOf(SEASONS, media.season);
  const facts: [string, string | null][] = [
    ["Format", formatLabel(media)],
    [
      media.type === "anime" ? "Episodes" : "Chapters",
      media.type === "anime"
        ? (media.episodes?.toString() ?? null)
        : (media.chapters?.toString() ?? null),
    ],
    ["Volumes", media.type === "manga" ? (media.volumes?.toString() ?? null) : null],
    ["Status", labelOf(STATUSES, media.status)],
    [
      media.type === "anime" ? "Aired" : "Published",
      season && media.year ? `${season} ${String(media.year)}` : (media.year?.toString() ?? null),
    ],
    ["AniList score", media.anilistScore !== null ? `${String(media.anilistScore)}%` : null],
    ["On AniList lists", media.popularity ? NUMBER.format(media.popularity) : null],
  ];
  const genreHref = (genre: string) =>
    `/browse?type=${media.type}&genre=${encodeURIComponent(genre)}` as Route;

  return (
    <article>
      <div
        className="relative h-40 overflow-hidden sm:h-64"
        style={{ backgroundColor: media.coverColor ?? "var(--surface-2)" }}
      >
        {media.bannerImageUrl && (
          <Image
            src={media.bannerImageUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-bg/30 to-bg" />
      </div>

      {/* Phones read top to bottom: cover, title, scores, then the rest. From md up it's
          two columns: cover and facts on the left, title and content on the right. */}
      <div className="mx-auto -mt-20 grid max-w-6xl gap-x-8 gap-y-6 px-4 sm:-mt-28 md:grid-cols-[14rem_1fr]">
        <div className="relative md:col-start-1 md:row-start-1">
          <div
            className="manga-panel relative mx-auto aspect-[2/3] w-44 overflow-hidden rounded-2xl md:w-full"
            style={{ backgroundColor: media.coverColor ?? "var(--surface-2)" }}
          >
            {media.coverImageUrl && (
              <Image
                src={media.coverImageUrl}
                alt={`Cover of ${media.title.display}`}
                fill
                priority
                sizes="(max-width: 767px) 11rem, 14rem"
                className="object-cover"
              />
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4 md:col-start-2 md:row-start-1 md:self-end">
          <header className="flex flex-col gap-2">
            <p className="text-sm font-bold uppercase tracking-widest text-accent-text">
              {{ anime: "Anime", manga: "Manga", manhwa: "Manhwa", manhua: "Manhua" }[media.kind]}
            </p>
            <AnimeHeading
              jp={media.title.native ?? media.title.romaji}
              className="text-4xl leading-none sm:text-6xl"
            >
              {media.title.display}
            </AnimeHeading>
            {(media.title.romaji !== media.title.display || media.title.native) && (
              <p className="text-muted">
                {[
                  media.title.romaji !== media.title.display ? media.title.romaji : null,
                  media.title.native,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </header>

          {media.genres.length > 0 && (
            <ul aria-label="Genres" className="flex flex-wrap gap-2">
              {media.genres.map((genre) => (
                <li key={genre}>
                  <Link
                    href={genreHref(genre)}
                    className="inline-block rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent-text hover:underline"
                  >
                    {genre}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="flex flex-col gap-5 md:col-start-1 md:row-start-2">
          <ListControl
            mediaId={media.id}
            type={media.type}
            initial={entry?.item ?? null}
            viewer={viewer}
          />

          <section aria-labelledby="your-verdict-heading" className="flex flex-col gap-3">
            <h2 id="your-verdict-heading" className="text-lg font-bold">
              Your verdict
            </h2>
            <ReviewEditor
              mediaId={media.id}
              mediaTitle={media.title.display}
              initial={mine?.item ?? null}
              viewer={viewer}
            />
          </section>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-border bg-surface p-4 text-sm md:grid-cols-1">
            {facts
              .filter((fact): fact is [string, string] => fact[1] !== null)
              .map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted">{label}</dt>
                  <dd className="font-semibold">{value}</dd>
                </div>
              ))}
          </dl>

          <a
            href={media.anilistUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-center text-sm font-semibold text-link hover:underline"
          >
            View on AniList<span aria-hidden="true"> ↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </aside>

        <div className="flex min-w-0 flex-col gap-6 md:col-start-2 md:row-start-2">
          <section aria-labelledby="synopsis-heading" className="flex flex-col gap-3">
            <h2 id="synopsis-heading" className="text-xl font-bold">
              Synopsis
            </h2>
            {media.synopsis ? (
              <Synopsis text={media.synopsis} />
            ) : (
              <p className="text-muted">AniList doesn&apos;t have a synopsis for this one yet.</p>
            )}
          </section>

          <ClubVerdict mediaId={media.id} club={media.club} canEdit={user?.role === "admin"} wide />

          <WhereTo kind={media.kind} links={media.links ?? []} />

          {media.tags.length > 0 && (
            <section aria-labelledby="tags-heading" className="flex flex-col gap-2">
              <h2 id="tags-heading" className="text-sm font-semibold text-muted">
                Tags
              </h2>
              <ul className="flex flex-wrap gap-2">
                {media.tags.slice(0, 15).map((tag) => (
                  <li
                    key={tag}
                    className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {media.characters.length > 0 && (
            <section aria-labelledby="characters-heading" className="flex flex-col gap-3">
              <h2 id="characters-heading" className="text-xl font-bold">
                Characters
              </h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {media.characters.map((character) => (
                  <li
                    key={character.anilistId}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2"
                  >
                    <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                      {character.imageUrl && (
                        <Image
                          src={character.imageUrl}
                          alt=""
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{character.name}</p>
                      <p className="text-xs text-muted">
                        {character.role === "MAIN"
                          ? "Main"
                          : character.role === "SUPPORTING"
                            ? "Supporting"
                            : "Background"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <HomeSection id="club-reviews" title="Club reviews" jp="クラブの声">
        {!reviews ? (
          <EmptyState>
            We couldn&apos;t load reviews right now. Please try again in a moment.
          </EmptyState>
        ) : reviews.items.length === 0 ? (
          <EmptyState>No one in the club has reviewed this yet.</EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reviews.items.map((review) => (
              <li key={review.id}>
                <ReviewCard review={review} viewer={viewer} showTitle={false} />
              </li>
            ))}
          </ul>
        )}
      </HomeSection>

      {similar && similar.items.length > 0 && (
        <HomeSection id="similar" title="If you like this" jp="おすすめ">
          <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
            {similar.items.map(({ media: item, reasons }) => (
              <li key={item.id} className="flex flex-col gap-1.5">
                <MediaCard media={item} />
                {reasons[0] && <p className="px-0.5 text-xs text-muted">{reasons[0]}</p>}
              </li>
            ))}
          </ul>
        </HomeSection>
      )}
    </article>
  );
}
