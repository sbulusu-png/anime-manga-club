import Link from "next/link";

import { HeroBanner } from "@/components/hero-banner";
import { EmptyState, HomeSection } from "@/components/home-section";
import { MediaCard } from "@/components/media-card";
import { Reveal } from "@/components/reveal";
import { ReviewCard } from "@/components/review-card";
import { SuggestionCard } from "@/components/suggestion-card";
import { TAGS, apiGet, apiGetAsViewer, getCurrentUser, viewerOf } from "@/lib/server-api";
import type { CurrentWeek, MediaSummary, Page, Review } from "@/lib/types";
import { weekLabel } from "@/lib/week";

const UNAVAILABLE = "We couldn't load this right now. Please try again in a moment.";

export default async function HomePage() {
  const [anime, manga, week, reviews, user] = await Promise.all([
    apiGet<Page<MediaSummary>>("/api/media?type=anime&sort=popularity&limit=6", 600, [
      TAGS.mediaLists,
    ]),
    apiGet<Page<MediaSummary>>("/api/media?type=manga&sort=popularity&limit=6", 600, [
      TAGS.mediaLists,
    ]),
    apiGet<CurrentWeek>("/api/club/suggestions/current", 60, [TAGS.club]),
    apiGetAsViewer<Page<Review>>("/api/reviews?sort=recent&limit=6", 30, [TAGS.reviews]),
    getCurrentUser(),
  ]);
  const viewer = viewerOf(user);

  return (
    <>
      <HeroBanner />

      <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-12 text-center">
        <p className="max-w-xl text-lg text-muted">
          Rate what you watch and read, see what the club loves, and get suggestions picked for your
          taste.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/browse"
            className="rounded-full bg-accent px-6 py-3 font-semibold text-accent-ink hover:brightness-110"
          >
            Browse anime &amp; manga
          </Link>
          <Link
            href="/for-you"
            className="rounded-full border border-border px-6 py-3 font-semibold hover:bg-surface-2"
          >
            Suggestions for you
          </Link>
        </div>
      </section>

      <HomeSection
        id="club-suggestions"
        title="Club suggestions"
        subtitle={week ? weekLabel(week.weekStart) : undefined}
        seeAll={{ href: "/club", label: "Past weeks" }}
      >
        {!week ? (
          <EmptyState>{UNAVAILABLE}</EmptyState>
        ) : week.items.length === 0 ? (
          <EmptyState>
            The club leads haven&apos;t picked this week&apos;s titles yet. Check back soon!
          </EmptyState>
        ) : (
          <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {week.items.map((suggestion) => (
              <SuggestionCard key={suggestion.id} suggestion={suggestion} className="reveal-item" />
            ))}
          </Reveal>
        )}
      </HomeSection>

      <HomeSection
        id="popular-anime"
        title="Most popular anime"
        seeAll={{ href: "/browse", label: "Browse all" }}
      >
        {anime?.items.length ? (
          <Reveal className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
            {anime.items.map((media) => (
              <div key={media.id} className="reveal-item">
                <MediaCard media={media} />
              </div>
            ))}
          </Reveal>
        ) : (
          <EmptyState>{UNAVAILABLE}</EmptyState>
        )}
      </HomeSection>

      <HomeSection
        id="popular-manga"
        title="Most popular manga"
        seeAll={{ href: "/browse", label: "Browse all" }}
      >
        {manga?.items.length ? (
          <Reveal className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
            {manga.items.map((media) => (
              <div key={media.id} className="reveal-item">
                <MediaCard media={media} />
              </div>
            ))}
          </Reveal>
        ) : (
          <EmptyState>{UNAVAILABLE}</EmptyState>
        )}
      </HomeSection>

      <HomeSection
        id="latest-reviews"
        title="Latest reviews"
        seeAll={{ href: "/reviews", label: "All reviews" }}
      >
        {!reviews ? (
          <EmptyState>{UNAVAILABLE}</EmptyState>
        ) : reviews.items.length === 0 ? (
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
            No reviews yet. Be the first member to share what you think!
          </EmptyState>
        ) : (
          <Reveal className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reviews.items.map((review) => (
              <div key={review.id} className="reveal-item">
                <ReviewCard review={review} viewer={viewer} />
              </div>
            ))}
          </Reveal>
        )}
      </HomeSection>
    </>
  );
}
