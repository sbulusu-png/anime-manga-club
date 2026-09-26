import { type SQL, and, desc, eq, gte, sql } from "drizzle-orm";

import type { Db } from "../db/client.js";
import { media, reviewLikes, reviews, users } from "../db/schema/index.js";
import { decodeCursor, encodeCursor } from "../lib/cursor.js";
import { isUniqueViolation } from "../lib/db-errors.js";
import { AppError } from "../lib/errors.js";
import { type Rating, ratingToValue, valueToRating } from "../lib/rating.js";

export const REVIEW_SORTS = ["recent", "top"] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];
export const REVIEW_PERIODS = ["week", "month", "year", "all"] as const;
export type ReviewPeriod = (typeof REVIEW_PERIODS)[number];

const PERIOD_DAYS: Record<Exclude<ReviewPeriod, "all">, number> = { week: 7, month: 30, year: 365 };

export interface ReviewInput {
  rating: Rating;
  body: string;
  hasSpoilers: boolean;
}

/** An edit → database columns (the verdict is stored as 1-4). */
function toColumns({ rating, ...rest }: Partial<ReviewInput>) {
  return { ...rest, ...(rating !== undefined && { score: ratingToValue(rating) }) };
}

const notFound = () => new AppError(404, "REVIEW_NOT_FOUND", "That review doesn't exist.");

/** Columns every review response needs: the review, its author and its title. */
function reviewSelection(viewerId: string | undefined) {
  return {
    review: reviews,
    // Microsecond-exact creation time for cursors (JS Dates only keep milliseconds,
    // which could make a page skip reviews posted within the same millisecond).
    createdAtExact: sql<string>`to_char(${reviews.createdAt} at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    author: {
      id: users.id,
      username: users.username,
      displayUsername: users.displayUsername,
      image: users.image,
    },
    media: {
      id: media.id,
      type: media.type,
      titleRomaji: media.titleRomaji,
      titleEnglish: media.titleEnglish,
      coverImageUrl: media.coverImageUrl,
    },
    likedByMe: viewerId
      ? sql<boolean>`exists (select 1 from ${reviewLikes}
          where ${reviewLikes.reviewId} = ${reviews.id} and ${reviewLikes.userId} = ${viewerId})`
      : sql<boolean>`false`,
  };
}

type ReviewRow = Awaited<ReturnType<typeof selectReviews>>[number];

function selectReviews(db: Db, viewerId: string | undefined) {
  return db
    .select(reviewSelection(viewerId))
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.userId))
    .innerJoin(media, eq(media.id, reviews.mediaId))
    .$dynamic();
}

/** Public JSON for a review. */
export function toReviewJson({ review, author, media: title, likedByMe }: ReviewRow) {
  return {
    id: review.id,
    rating: valueToRating(review.score),
    body: review.body,
    hasSpoilers: review.hasSpoilers,
    likeCount: review.likeCount,
    likedByMe,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    edited: review.updatedAt.getTime() > review.createdAt.getTime(),
    author: {
      id: author.id,
      username: author.username,
      displayUsername: author.displayUsername,
      image: author.image,
    },
    media: {
      id: title.id,
      type: title.type,
      title: title.titleEnglish ?? title.titleRomaji,
      coverImageUrl: title.coverImageUrl,
    },
  };
}

export async function getReview(db: Db, id: string, viewerId?: string) {
  const [row] = await selectReviews(db, viewerId).where(eq(reviews.id, id));
  if (!row) throw notFound();
  return row;
}

export interface ListReviewsParams {
  mediaId?: number | undefined;
  username?: string | undefined;
  sort: ReviewSort;
  period: ReviewPeriod;
  limit: number;
  cursor?: string | undefined;
  viewerId?: string | undefined;
}

export async function listReviews(db: Db, params: ListReviewsParams) {
  const conditions: (SQL | undefined)[] = [];
  if (params.mediaId !== undefined) conditions.push(eq(reviews.mediaId, params.mediaId));
  if (params.username !== undefined) {
    conditions.push(eq(users.username, params.username.toLowerCase()));
  }
  if (params.period !== "all") {
    const since = new Date(Date.now() - PERIOD_DAYS[params.period] * 24 * 60 * 60 * 1000);
    conditions.push(gte(reviews.createdAt, since));
  }

  // Keyset pagination: (created_at, id) for recent, (like_count, id) for top.
  if (params.cursor) {
    const [value, id] = decodeCursor(params.cursor);
    const valid =
      typeof id === "string" &&
      (params.sort === "top" ? typeof value === "number" : typeof value === "string");
    if (!valid) throw new AppError(400, "INVALID_CURSOR", "That page link is invalid or expired.");
    conditions.push(
      params.sort === "top"
        ? sql`(${reviews.likeCount}, ${reviews.id}) < (${value}::int, ${id}::uuid)`
        : sql`(${reviews.createdAt}, ${reviews.id}) < (${value}::timestamptz, ${id}::uuid)`,
    );
  }

  const order =
    params.sort === "top"
      ? [desc(reviews.likeCount), desc(reviews.id)]
      : [desc(reviews.createdAt), desc(reviews.id)];

  const rows = await selectReviews(db, params.viewerId)
    .where(and(...conditions))
    .orderBy(...order)
    .limit(params.limit + 1);

  const page = rows.slice(0, params.limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > params.limit && last
      ? encodeCursor([
          params.sort === "top" ? last.review.likeCount : last.createdAtExact,
          last.review.id,
        ])
      : null;

  return { items: page, nextCursor };
}

/** The signed-in user's own review of a title, if they've written one. */
export async function getMyReview(db: Db, userId: string, mediaId: number) {
  const [row] = await selectReviews(db, userId).where(
    and(eq(reviews.userId, userId), eq(reviews.mediaId, mediaId)),
  );
  return row ?? null;
}

export async function createReview(db: Db, userId: string, mediaId: number, input: ReviewInput) {
  const [title] = await db
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.id, mediaId), eq(media.isAdult, false)));
  if (!title) throw new AppError(404, "MEDIA_NOT_FOUND", "No anime or manga with that id.");

  try {
    const [created] = await db
      .insert(reviews)
      .values({
        userId,
        mediaId,
        score: ratingToValue(input.rating),
        body: input.body,
        hasSpoilers: input.hasSpoilers,
      })
      .returning({ id: reviews.id });
    if (!created) throw new Error("insert returned no row");
    return await getReview(db, created.id, userId);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(
        409,
        "REVIEW_EXISTS",
        "You've already reviewed this title. Edit it instead.",
      );
    }
    throw err;
  }
}

/** Loads a review's owner, or 404s. */
async function ownerOf(db: Db, reviewId: string) {
  const [row] = await db
    .select({ userId: reviews.userId })
    .from(reviews)
    .where(eq(reviews.id, reviewId));
  if (!row) throw notFound();
  return row.userId;
}

export async function updateReview(
  db: Db,
  userId: string,
  reviewId: string,
  patch: Partial<ReviewInput>,
) {
  if ((await ownerOf(db, reviewId)) !== userId) {
    throw new AppError(403, "FORBIDDEN", "You can only edit your own reviews.");
  }
  if (Object.keys(patch).length > 0) {
    // Use the database clock so "edited" compares two timestamps from the same clock.
    await db
      .update(reviews)
      .set({ ...toColumns(patch), updatedAt: sql`now()` })
      .where(eq(reviews.id, reviewId));
  }
  return getReview(db, reviewId, userId);
}

/** Authors can delete their own reviews; admins can delete any (moderation). */
export async function deleteReview(db: Db, userId: string, reviewId: string) {
  if ((await ownerOf(db, reviewId)) !== userId) {
    const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
    if (user?.role !== "admin") {
      throw new AppError(403, "FORBIDDEN", "You can only delete your own reviews.");
    }
  }
  await db.delete(reviews).where(eq(reviews.id, reviewId));
}

/** Likes are idempotent: liking twice or unliking something not liked is a no-op. */
export async function setLike(db: Db, userId: string, reviewId: string, liked: boolean) {
  if ((await ownerOf(db, reviewId)) === userId) {
    throw new AppError(403, "CANNOT_LIKE_OWN_REVIEW", "You can't like your own review.");
  }
  if (liked) {
    await db.insert(reviewLikes).values({ userId, reviewId }).onConflictDoNothing();
  } else {
    await db
      .delete(reviewLikes)
      .where(and(eq(reviewLikes.userId, userId), eq(reviewLikes.reviewId, reviewId)));
  }
  const [row] = await db
    .select({ likeCount: reviews.likeCount })
    .from(reviews)
    .where(eq(reviews.id, reviewId));
  return { liked, likeCount: row?.likeCount ?? 0 };
}
