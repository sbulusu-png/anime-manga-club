import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const mediaType = pgEnum("media_type", ["anime", "manga"]);

/** Anime and manga titles, cached from AniList. */
export const media = pgTable(
  "media",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    anilistId: integer().notNull().unique("media_anilist_id_unique"),
    malId: integer(),
    type: mediaType().notNull(),
    // AniList enums kept as text so new values upstream never break inserts.
    format: text(), // TV, MOVIE, OVA, MANGA, ONE_SHOT, ...
    status: text(), // FINISHED, RELEASING, NOT_YET_RELEASED, ...
    titleRomaji: text().notNull(),
    titleEnglish: text(),
    titleNative: text(),
    synopsis: text(),
    coverImageUrl: text(),
    coverColor: text(),
    bannerImageUrl: text(),
    genres: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    tags: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    season: text(), // WINTER, SPRING, SUMMER, FALL (anime only)
    seasonYear: smallint(),
    startYear: smallint(),
    episodes: integer(),
    chapters: integer(),
    volumes: integer(),
    anilistScore: smallint(), // 0-100
    popularity: integer(),
    isAdult: boolean().notNull().default(false),
    // Club review stats, maintained by a trigger on reviews (migration 0004).
    clubReviewCount: integer().notNull().default(0),
    clubScoreSum: integer().notNull().default(0),
    syncedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index().on(t.type, t.popularity.desc()),
    check(
      "media_club_stats_non_negative",
      sql`${t.clubReviewCount} >= 0 and ${t.clubScoreSum} >= 0`,
    ),
    index().using("gin", t.genres),
    index().using("gin", t.tags),
    // Trigram indexes make `ilike '%term%'` title search fast (needs pg_trgm, migration 0001).
    index("media_title_romaji_trgm_index").using("gin", t.titleRomaji.op("gin_trgm_ops")),
    index("media_title_english_trgm_index").using("gin", t.titleEnglish.op("gin_trgm_ops")),
    index("media_title_native_trgm_index").using("gin", t.titleNative.op("gin_trgm_ops")),
  ],
);
