import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { media } from "./media.js";

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

const userRef = () =>
  text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });
const mediaRef = () =>
  integer()
    .notNull()
    .references(() => media.id, { onDelete: "cascade" });

/**
 * One review per user per title. `score` is the verdict as 1-4 (skip, timepass, go for it,
 * perfection; see lib/rating.ts), so the club counters can sum and average it.
 */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: userRef(),
    mediaId: mediaRef(),
    score: smallint().notNull(),
    body: text().notNull(),
    hasSpoilers: boolean().notNull().default(false),
    // Maintained by a trigger on review_likes (migration 0004); never set it directly.
    likeCount: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("reviews_user_id_media_id_unique").on(t.userId, t.mediaId),
    index().on(t.mediaId, t.createdAt.desc()),
    index().on(t.userId, t.createdAt.desc()),
    index().on(t.createdAt.desc(), t.id.desc()),
    index().on(t.likeCount.desc(), t.id.desc()),
    index().on(t.mediaId, t.likeCount.desc(), t.id.desc()),
    check("reviews_score_range", sql`${t.score} between 1 and 4`),
    check("reviews_body_length", sql`char_length(${t.body}) between 1 and 20000`),
    check("reviews_like_count_non_negative", sql`${t.likeCount} >= 0`),
  ],
);

export const reviewLikes = pgTable(
  "review_likes",
  {
    userId: userRef(),
    reviewId: uuid()
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.reviewId] }), index().on(t.reviewId)],
);

/** Watch/read progress, shown as the user's watchlist. Mirrors AniList list statuses. */
export const listStatus = pgEnum("list_status", ["current", "completed", "paused", "dropped"]);

export const listEntries = pgTable(
  "list_entries",
  {
    userId: userRef(),
    mediaId: mediaRef(),
    status: listStatus().notNull(),
    progress: integer().notNull().default(0), // episodes watched or chapters read
    // The member's own 0-100 score, from a list they imported (AniList). A taste signal.
    score: smallint(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.mediaId] }),
    index().on(t.userId, t.status),
    index().on(t.mediaId),
    check("list_entries_progress_non_negative", sql`${t.progress} >= 0`),
    check("list_entries_score_range", sql`${t.score} between 0 and 100`),
  ],
);

export const follows = pgTable(
  "follows",
  {
    followerId: userRef(),
    followingId: userRef(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followingId] }),
    index().on(t.followingId),
    check("follows_not_self", sql`${t.followerId} <> ${t.followingId}`),
  ],
);

/** Titles the club admins suggest for a given week. */
export const clubSuggestions = pgTable(
  "club_suggestions",
  {
    id: uuid().primaryKey().defaultRandom(),
    mediaId: mediaRef(),
    suggestedById: text().references(() => users.id, { onDelete: "set null" }),
    weekStart: date({ mode: "string" }).notNull(), // Monday of the week, YYYY-MM-DD
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("club_suggestions_week_start_media_id_unique").on(t.weekStart, t.mediaId),
    index().on(t.weekStart.desc()),
    check("club_suggestions_week_is_monday", sql`extract(isodow from ${t.weekStart}) = 1`),
  ],
);
