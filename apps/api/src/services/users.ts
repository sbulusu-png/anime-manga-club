import { and, eq, sql } from "drizzle-orm";

import type { Db } from "../db/client.js";
import { listEntries, media, reviews, users } from "../db/schema/index.js";
import { AppError } from "../lib/errors.js";
import { RATINGS, type Rating, ratingToValue, valueToRating } from "../lib/rating.js";
import { LIST_STATUSES, type ListStatus } from "./list.js";

const rowsOf = <T>(result: unknown) => (result as { rows: T[] }).rows;

/**
 * A member's public profile. Only what they chose to show the club: their username
 * and avatar, never their real name or email.
 */
export async function getProfile(db: Db, username: string) {
  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      displayUsername: users.displayUsername,
      image: users.image,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    // Suspended members' profiles are hidden, like their absence from the club.
    .where(and(eq(users.username, username.toLowerCase()), eq(users.banned, false)));
  if (!user?.username) throw new AppError(404, "USER_NOT_FOUND", "No member with that username.");

  const [reviewStats, verdictRows, listRows, genreRows] = await Promise.all([
    db
      .select({
        reviews: sql<number>`count(*)::int`,
        likesReceived: sql<number>`coalesce(sum(${reviews.likeCount}), 0)::int`,
      })
      .from(reviews)
      .where(eq(reviews.userId, user.id)),
    db
      .select({ score: reviews.score, count: sql<number>`count(*)::int` })
      .from(reviews)
      .where(eq(reviews.userId, user.id))
      .groupBy(reviews.score),
    db
      .select({
        type: media.type,
        status: listEntries.status,
        count: sql<number>`count(*)::int`,
        progress: sql<number>`coalesce(sum(${listEntries.progress}), 0)::int`,
      })
      .from(listEntries)
      .innerJoin(media, eq(media.id, listEntries.mediaId))
      .where(and(eq(listEntries.userId, user.id), eq(media.isAdult, false)))
      .groupBy(media.type, listEntries.status),
    // Favourite genres: titles they rated "Go for it" or better, or completed.
    db.execute(sql`
      select genre, count(*)::int as count
      from (
        select ${reviews.mediaId} as media_id from ${reviews}
        where ${reviews.userId} = ${user.id} and ${reviews.score} >= ${ratingToValue("go_for_it")}
        union
        select ${listEntries.mediaId} from ${listEntries}
        where ${listEntries.userId} = ${user.id} and ${listEntries.status} = 'completed'
      ) liked
      join ${media} m on m.id = liked.media_id and not m.is_adult
      cross join lateral unnest(m.genres) as genre
      group by genre
      order by count desc, genre
      limit 5
    `),
  ]);

  const verdicts = Object.fromEntries(RATINGS.map((r) => [r, 0])) as Record<Rating, number>;
  for (const { score, count } of verdictRows) verdicts[valueToRating(score)] = count;

  const emptyStatuses = () =>
    Object.fromEntries(LIST_STATUSES.map((s) => [s, 0])) as Record<ListStatus, number>;
  const list = { anime: emptyStatuses(), manga: emptyStatuses() };
  let episodesWatched = 0;
  let chaptersRead = 0;
  for (const row of listRows) {
    list[row.type][row.status] = row.count;
    if (row.type === "anime") episodesWatched += row.progress;
    else chaptersRead += row.progress;
  }

  return {
    user: {
      username: user.username,
      displayUsername: user.displayUsername,
      image: user.image,
      role: user.role,
      joinedAt: user.createdAt,
    },
    stats: {
      reviews: reviewStats[0]?.reviews ?? 0,
      likesReceived: reviewStats[0]?.likesReceived ?? 0,
      verdicts,
      list,
      episodesWatched,
      chaptersRead,
      topGenres: rowsOf<{ genre: string; count: number }>(genreRows).map((r) => r.genre),
    },
  };
}
