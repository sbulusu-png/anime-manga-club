import Image from "next/image";
import Link from "next/link";

import type { Review, Viewer } from "@/lib/types";

import { LikeButton } from "./like-button";
import { SpoilerText } from "./spoiler-text";
import { VerdictBadge } from "./verdict-badge";

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 days ago". Rendered on the server only, so it can't disagree with the browser. */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return RELATIVE.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

/** A member's avatar, or their initial when they don't have one. */
export function Avatar({
  name,
  image,
  size = 36,
}: {
  name: string;
  image: string | null;
  size?: number;
}) {
  return image ? (
    <Image
      src={image}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full border border-border object-cover"
      // Google avatars; not worth routing through the image optimiser.
      unoptimized
    />
  ) : (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full bg-accent font-bold text-accent-ink"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * One review. In feeds it's headed by the title it's about; on a title's own page
 * (`showTitle={false}`) by its author instead.
 */
export function ReviewCard({
  review,
  viewer,
  showTitle = true,
}: {
  review: Review;
  viewer: Viewer;
  showTitle?: boolean;
}) {
  const author = review.author.displayUsername ?? review.author.username ?? "A member";
  const byline = (
    <>
      {review.author.username ? (
        <Link href={`/u/${review.author.username}`} className="font-semibold hover:underline">
          {author}
        </Link>
      ) : (
        author
      )}{" "}
      · {timeAgo(review.createdAt)}
      {review.edited && " · edited"}
    </>
  );

  return (
    <article className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-card">
      <header className="flex items-center gap-3">
        {showTitle ? (
          <>
            {review.media.coverImageUrl ? (
              <Image
                src={review.media.coverImageUrl}
                alt=""
                width={40}
                height={56}
                className="h-14 w-10 shrink-0 rounded-md object-cover"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-semibold">
                {/* inline-block so the tap target is the full 24px line (WCAG 2.2 target size). */}
                <Link
                  href={`/media/${String(review.media.id)}`}
                  className="inline-block max-w-full truncate align-bottom hover:underline"
                >
                  {review.media.title}
                </Link>
              </h3>
              <p className="truncate text-xs text-muted">by {byline}</p>
            </div>
          </>
        ) : (
          <>
            <Avatar name={author} image={review.author.image} />
            <p className="min-w-0 flex-1 truncate text-sm text-muted">{byline}</p>
          </>
        )}
        <VerdictBadge rating={review.rating} size="sm" className="shrink-0" />
      </header>

      <SpoilerText text={review.body} spoiler={review.hasSpoilers} />

      <footer className="mt-auto -ml-2">
        <LikeButton
          reviewId={review.id}
          authorId={review.author.id}
          initialLiked={review.likedByMe}
          initialCount={review.likeCount}
          viewer={viewer}
        />
      </footer>
    </article>
  );
}
