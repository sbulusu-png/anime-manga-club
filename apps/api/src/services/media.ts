import {
  type SQL,
  and,
  arrayContains,
  asc,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";

import type { Db } from "../db/client.js";
import { media, reviews } from "../db/schema/index.js";
import { type AnilistClient, type Character, toMediaRow } from "../lib/anilist.js";
import { type Cursor, decodeCursor, encodeCursor } from "../lib/cursor.js";
import { AppError } from "../lib/errors.js";
import { RATINGS, type Rating, valueToRating } from "../lib/rating.js";
import { titleKey } from "../lib/title-key.js";
import { TtlCache } from "../lib/ttl-cache.js";

export type MediaRow = typeof media.$inferSelect;

/**
 * What a title is, as readers say it: AniList files Korean manhwa and Chinese manhua
 * under MANGA, so the country of origin tells them apart.
 */
export const MEDIA_KINDS = ["anime", "manga", "manhwa", "manhua"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
const MANHUA_COUNTRIES = ["CN", "TW", "HK"];

export function kindOf(row: Pick<MediaRow, "type" | "country">): MediaKind {
  if (row.type === "anime") return "anime";
  if (row.country === "KR") return "manhwa";
  if (row.country && MANHUA_COUNTRIES.includes(row.country)) return "manhua";
  return "manga";
}

/** SQL for one kind; "manga" means Japanese (or unknown origin) comics only. */
function kindCondition(kind: MediaKind): SQL {
  switch (kind) {
    case "anime":
      return sql`${media.type} = 'anime'`;
    case "manhwa":
      return sql`${media.type} = 'manga' and ${media.country} = 'KR'`;
    case "manhua":
      return sql`${media.type} = 'manga' and ${media.country} in ('CN', 'TW', 'HK')`;
    case "manga":
      return sql`${media.type} = 'manga' and coalesce(${media.country}, 'JP') not in ('KR', 'CN', 'TW', 'HK')`;
  }
}

// Lists of titles only show cards, so they skip the long text columns: half the bytes
// (and about half the query time) for a page of results or 300 suggestion candidates.
const { synopsis, searchKey, synonyms, ...cardColumns } = getTableColumns(media);
export const CARD_COLUMNS = cardColumns;
export type CardRow = Omit<MediaRow, "synopsis" | "searchKey" | "synonyms">;
export const MEDIA_SORTS = ["popularity", "score", "club", "newest", "title"] as const;
export type MediaSort = (typeof MEDIA_SORTS)[number];

/** Titles refreshed from AniList once they are older than this. */
export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export interface ListMediaParams {
  type?: MediaKind | undefined;
  q?: string | undefined;
  genres?: string[] | undefined;
  tags?: string[] | undefined;
  season?: string | undefined;
  year?: number | undefined;
  format?: string | undefined;
  status?: string | undefined;
  sort: MediaSort;
  limit: number;
  cursor?: string | undefined;
}

// Each sort is an expression plus a direction; `id` breaks ties so paging is stable.
// Missing numbers become -1 so they sort last and still fit in the cursor.
const SORTS: Record<MediaSort, { expr: SQL<number | string>; direction: "asc" | "desc" }> = {
  popularity: { expr: sql<number>`coalesce(${media.popularity}, -1)`, direction: "desc" },
  score: { expr: sql<number>`coalesce(${media.anilistScore}, -1)`, direction: "desc" },
  // Club average x100 as an integer (so it round-trips exactly in cursors); unreviewed last.
  club: {
    expr: sql<number>`case when ${media.clubReviewCount} > 0
      then round(${media.clubScoreSum} * 100.0 / ${media.clubReviewCount})::int else -1 end`,
    direction: "desc",
  },
  newest: {
    expr: sql<number>`coalesce(${media.seasonYear}, ${media.startYear}, -1)`,
    direction: "desc",
  },
  title: {
    expr: sql<string>`lower(coalesce(${media.titleEnglish}, ${media.titleRomaji}))`,
    direction: "asc",
  },
};

/** Escapes LIKE wildcards so a search for "100%" means the literal text. */
function likeContains(term: string) {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export async function listMedia(db: Db, params: ListMediaParams) {
  const sort = SORTS[params.sort];
  const conditions: (SQL | undefined)[] = [eq(media.isAdult, false)];

  if (params.type) conditions.push(kindCondition(params.type));
  if (params.q) {
    const pattern = likeContains(params.q);
    const key = titleKey(params.q);
    const words = key.split(" ").filter(Boolean);
    conditions.push(
      or(
        ilike(media.titleRomaji, pattern),
        ilike(media.titleEnglish, pattern),
        ilike(media.titleNative, pattern),
        // English, Japanese (in English letters or not) and alternative names, spelled
        // loosely: every word found, in any order ("shingeki kyojin")...
        words.length > 0
          ? and(...words.map((word) => ilike(media.searchKey, likeContains(word))))
          : undefined,
        // ...or close enough to forgive a typo ("shingeky no kyojin"). Short queries
        // match too much this way, so they rely on the exact matches above.
        key.length >= 5 ? sql`${key} <% ${media.searchKey}` : undefined,
      ),
    );
  }
  if (params.genres?.length) conditions.push(arrayContains(media.genres, params.genres));
  if (params.tags?.length) conditions.push(arrayContains(media.tags, params.tags));
  if (params.season) conditions.push(eq(media.season, params.season));
  if (params.year) {
    conditions.push(sql`coalesce(${media.seasonYear}, ${media.startYear}) = ${params.year}`);
  }
  if (params.format) conditions.push(eq(media.format, params.format));
  if (params.status) conditions.push(eq(media.status, params.status));
  if (params.cursor) {
    const [value, id] = decodeCursor(params.cursor);
    // A cursor from one sort order can't be used with another.
    if (typeof value !== (params.sort === "title" ? "string" : "number")) {
      throw new AppError(400, "INVALID_CURSOR", "That page link is invalid or expired.");
    }
    conditions.push(
      sort.direction === "desc"
        ? sql`(${sort.expr}, ${media.id}) < (${value}, ${id})`
        : sql`(${sort.expr}, ${media.id}) > (${value}, ${id})`,
    );
  }

  const order = sort.direction === "desc" ? desc : asc;
  const rows = await db
    .select({ row: CARD_COLUMNS, sortValue: sort.expr })
    .from(media)
    .where(and(...conditions))
    .orderBy(order(sort.expr), order(media.id))
    .limit(params.limit + 1); // one extra tells us whether there's another page

  const page = rows.slice(0, params.limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > params.limit && last
      ? encodeCursor([last.sortValue, last.row.id] satisfies Cursor)
      : null;

  return { items: page.map(({ row }) => row), nextCursor };
}

export async function getMedia(db: Db, id: number): Promise<MediaRow | null> {
  const [row] = await db
    .select()
    .from(media)
    .where(and(eq(media.id, id), eq(media.isAdult, false)));
  return row ?? null;
}

/** Every genre in the catalog, alphabetically, for filter menus. */
export async function listGenres(db: Db): Promise<string[]> {
  const rows = await db
    .selectDistinct({ genre: sql<string>`unnest(${media.genres})`.as("genre") })
    .from(media)
    .where(eq(media.isAdult, false))
    .orderBy(sql`genre`);
  return rows.map((r) => r.genre);
}

/** Inserts or refreshes titles by AniList id and returns the stored rows. */
export async function upsertMedia(
  db: Db,
  rows: (typeof media.$inferInsert)[],
): Promise<MediaRow[]> {
  if (rows.length === 0) return [];
  return db
    .insert(media)
    .values(rows)
    .onConflictDoUpdate({
      target: media.anilistId,
      set: {
        malId: sql`excluded.mal_id`,
        type: sql`excluded.type`,
        format: sql`excluded.format`,
        country: sql`excluded.country`,
        status: sql`excluded.status`,
        titleRomaji: sql`excluded.title_romaji`,
        titleEnglish: sql`excluded.title_english`,
        titleNative: sql`excluded.title_native`,
        synonyms: sql`excluded.synonyms`,
        searchKey: sql`excluded.search_key`,
        synopsis: sql`excluded.synopsis`,
        coverImageUrl: sql`excluded.cover_image_url`,
        coverColor: sql`excluded.cover_color`,
        bannerImageUrl: sql`excluded.banner_image_url`,
        genres: sql`excluded.genres`,
        tags: sql`excluded.tags`,
        season: sql`excluded.season`,
        seasonYear: sql`excluded.season_year`,
        startYear: sql`excluded.start_year`,
        episodes: sql`excluded.episodes`,
        chapters: sql`excluded.chapters`,
        volumes: sql`excluded.volumes`,
        anilistScore: sql`excluded.anilist_score`,
        popularity: sql`excluded.popularity`,
        isAdult: sql`excluded.is_adult`,
        syncedAt: sql`excluded.synced_at`,
        updatedAt: sql`now()`,
      },
    })
    .returning();
}

/** Finds a title by AniList id, importing it from AniList the first time it's asked for. */
export async function getOrImportByAnilistId(
  db: Db,
  anilist: AnilistClient,
  anilistId: number,
): Promise<MediaRow | null> {
  const [existing] = await db.select().from(media).where(eq(media.anilistId, anilistId));
  if (existing) return existing.isAdult ? null : existing;

  const remote = await anilist.byId(anilistId);
  if (!remote || remote.isAdult) return null;
  const [stored] = await upsertMedia(db, [toMediaRow(remote)]);
  return stored ?? null;
}

const discoverCache = new TtlCache<number[]>(10 * 60 * 1000);

/**
 * Searches AniList for titles the club hasn't seen yet, stores them, and returns
 * them in AniList's relevance order. Results are cached for 10 minutes per query.
 */
export async function discoverMedia(
  db: Db,
  anilist: AnilistClient,
  q: string,
  type?: "anime" | "manga",
): Promise<MediaRow[]> {
  const key = `${type ?? "all"}|${q.trim().toLowerCase()}`;
  let anilistIds = discoverCache.get(key);

  if (!anilistIds) {
    const anilistType = type === "anime" ? "ANIME" : type === "manga" ? "MANGA" : undefined;
    const results = (await anilist.search(q, anilistType)).filter((item) => !item.isAdult);
    await upsertMedia(db, results.map(toMediaRow));
    anilistIds = results.map((item) => item.id);
    discoverCache.set(key, anilistIds);
  }
  if (anilistIds.length === 0) return [];

  const rows = await db.select().from(media).where(inArray(media.anilistId, anilistIds));
  const byAnilistId = new Map(rows.map((row) => [row.anilistId, row]));
  return anilistIds.flatMap((id) => byAnilistId.get(id) ?? []);
}

export function isStale(row: MediaRow, now = Date.now()): boolean {
  return now - row.syncedAt.getTime() > STALE_AFTER_MS;
}

const refreshing = new Set<number>();

/**
 * Re-fetches one title from AniList and stores the fresh copy. Concurrent calls
 * for the same title share one refresh instead of each hitting AniList.
 */
export async function refreshMedia(db: Db, anilist: AnilistClient, row: MediaRow) {
  if (refreshing.has(row.id)) return;
  refreshing.add(row.id);
  try {
    const remote = await anilist.byId(row.anilistId);
    if (remote) await upsertMedia(db, [toMediaRow(remote)]);
  } finally {
    refreshing.delete(row.id);
  }
}

const characterCache = new TtlCache<Character[]>(24 * 60 * 60 * 1000);

/** Main and supporting characters, cached for a day. */
export async function getCharacters(anilist: AnilistClient, anilistId: number) {
  const key = String(anilistId);
  const cached = characterCache.get(key);
  if (cached) return cached;
  const characters = await anilist.characters(anilistId);
  characterCache.set(key, characters);
  return characters;
}

/** Public JSON for a title in lists. */
export function toMediaSummary(row: CardRow) {
  return {
    id: row.id,
    anilistId: row.anilistId,
    type: row.type,
    kind: kindOf(row),
    format: row.format,
    status: row.status,
    title: {
      display: row.titleEnglish ?? row.titleRomaji,
      romaji: row.titleRomaji,
      english: row.titleEnglish,
      native: row.titleNative,
    },
    coverImageUrl: row.coverImageUrl,
    coverColor: row.coverColor,
    genres: row.genres,
    season: row.season,
    year: row.seasonYear ?? row.startYear,
    episodes: row.episodes,
    chapters: row.chapters,
    anilistScore: row.anilistScore,
    popularity: row.popularity,
    club: clubStats(row),
  };
}

/**
 * The club's verdict (members' average, rounded to the nearest verdict), the average
 * itself on the 1-4 scale (2 decimals, for sorting and finer display), and how many
 * reviews it's based on.
 */
export function clubStats(row: Pick<MediaRow, "clubReviewCount" | "clubScoreSum">) {
  const average = row.clubReviewCount > 0 ? row.clubScoreSum / row.clubReviewCount : null;
  return {
    verdict: average === null ? null : valueToRating(average),
    average: average === null ? null : Math.round(average * 100) / 100,
    reviewCount: row.clubReviewCount,
  };
}

export type RatingBreakdown = Record<Rating, number>;

/** How many members gave each verdict, for a title's page. */
export async function ratingBreakdown(db: Db, mediaId: number): Promise<RatingBreakdown> {
  const rows = await db
    .select({ score: reviews.score, count: sql<number>`count(*)::int` })
    .from(reviews)
    .where(eq(reviews.mediaId, mediaId))
    .groupBy(reviews.score);
  const breakdown = Object.fromEntries(RATINGS.map((r) => [r, 0])) as RatingBreakdown;
  for (const { score, count } of rows) breakdown[valueToRating(score)] = count;
  return breakdown;
}

/** Public JSON for a title's own page. */
export function toMediaDetail(row: MediaRow, characters: Character[], breakdown: RatingBreakdown) {
  const summary = toMediaSummary(row);
  return {
    ...summary,
    club: { ...summary.club, breakdown },
    malId: row.malId,
    synopsis: row.synopsis,
    bannerImageUrl: row.bannerImageUrl,
    tags: row.tags,
    volumes: row.volumes,
    anilistUrl: `https://anilist.co/${row.type}/${row.anilistId}`,
    characters,
    syncedAt: row.syncedAt,
  };
}
