// Explainable recommendations: every suggestion carries the reasons it was made.
//
// "For you" blends three signals:
//   1. Taste profile: genre, theme (tag) and format affinities learned from the member's
//      verdicts and list.
//   2. Collaborative: titles loved by members who love the same things.
//   3. Quality: AniList score, the club's own verdict, and a little popularity.
// "Similar titles" blends co-liking ("members who loved X also loved Y") with
// genre/tag overlap, so it works before the club has written many reviews.
import {
  type SQL,
  and,
  arrayOverlaps,
  desc,
  eq,
  inArray,
  isNotNull,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import type { Db } from "../db/client.js";
import { listEntries, media, reviews } from "../db/schema/index.js";
import { AppError } from "../lib/errors.js";
import { RATING_LABELS, type Rating, ratingToValue, valueToRating } from "../lib/rating.js";
import type { ListStatus } from "./list.js";
import { type MediaRow, getMedia, toMediaSummary } from "./media.js";

/**
 * "Go for it" or "Perfection" counts as loved; so does a completed title the member
 * didn't review. (Reviews store verdicts as 1-4; see lib/rating.ts.)
 */
export const LOVED_SCORE = ratingToValue("go_for_it");
/** Cast and audience tags are true of half the catalog, so they make dull reasons. */
const GENERIC_TAG =
  /Protagonist$|^Primarily .+ Cast$|^(Ensemble Cast|Shounen|Shoujo|Seinen|Josei)$/;

/** A club favourite averages "Go for it" or better. */
const CLUB_FAVOURITE = ratingToValue("go_for_it");

/** Members who loved the same titles (see LOVED_SCORE). */
const LOVED = sql`loved as (
  select ${reviews.userId} as user_id, ${reviews.mediaId} as media_id
  from ${reviews} where ${reviews.score} >= ${LOVED_SCORE}
  union
  select l.user_id, l.media_id from ${listEntries} l
  where l.status = 'completed'
    and not exists (
      select 1 from ${reviews} r where r.user_id = l.user_id and r.media_id = l.media_id
    )
)`;

/** What each verdict says about a member's taste, from -1 (disliked) to 1 (loved). */
const VERDICT_WEIGHTS: Record<Rating, number> = {
  skip: -1,
  timepass: -0.2,
  go_for_it: 0.7,
  perfection: 1,
};

/** How much each kind of interaction says about taste, from -1 (disliked) to 1 (loved). */
export function signalWeight(score: number | null, status: ListStatus | null): number {
  if (score !== null) return VERDICT_WEIGHTS[valueToRating(score)];
  switch (status) {
    case "completed":
      return 0.6;
    case "current":
      return 0.4;
    case "planning":
      return 0.2;
    case "paused":
      return 0.1;
    case "dropped":
      return -0.7;
    default:
      return 0;
  }
}

/**
 * Groups a series' seasons, parts, movies and its anime/manga versions under one key
 * ("Attack on Titan Season 3 Part 2" -> "attack on titan"), so recommendations don't
 * fill up with one franchise.
 */
export function franchiseKey(row: Pick<MediaRow, "titleEnglish" | "titleRomaji">) {
  return (
    (row.titleEnglish ?? row.titleRomaji)
      .toLowerCase()
      // The series name comes before a subtitle: "Name: Sub", "Name -Sub-", "Name - Sub".
      .split(/[:：]|\s[-–—]|[-–—]\s/)[0]
      ?.replace(/\b(the )?(final season|movie|film)\b/g, " ")
      .replace(/\b\d+(st|nd|rd|th) season\b/g, " ")
      .replace(/\b(season|part|cour)\s*\d+\b/g, " ")
      .replace(/\b(ii|iii|iv|v|vi)\s*$/g, " ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+\d+\s*$/g, " ")
      .trim() ?? ""
  );
}

/** Keeps the best-scored title of each franchise, in score order. */
function onePerFranchise<T extends { row: MediaRow }>(ranked: T[], limit: number): T[] {
  const seen = new Set<string>();
  const picked: T[] = [];
  for (const item of ranked) {
    const key = franchiseKey(item.row);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(item);
    if (picked.length === limit) break;
  }
  return picked;
}

function clubAverage(row: MediaRow): number | null {
  return row.clubReviewCount > 0 ? row.clubScoreSum / row.clubReviewCount : null;
}

/** Normalises an affinity map so the strongest signal is ±1. */
function normalise(map: Map<string, number>) {
  const max = Math.max(0, ...[...map.values()].map(Math.abs));
  if (max > 0) for (const [key, value] of map) map.set(key, value / max);
  return map;
}

function joinWords(words: string[]) {
  return words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words.at(-1) ?? ""}`;
}

async function tasteSignals(db: Db, userId: string) {
  return db
    .select({
      mediaId: media.id,
      type: media.type,
      titleEnglish: media.titleEnglish,
      titleRomaji: media.titleRomaji,
      format: media.format,
      genres: media.genres,
      tags: media.tags,
      score: reviews.score,
      status: listEntries.status,
    })
    .from(media)
    .leftJoin(reviews, and(eq(reviews.mediaId, media.id), eq(reviews.userId, userId)))
    .leftJoin(listEntries, and(eq(listEntries.mediaId, media.id), eq(listEntries.userId, userId)))
    .where(or(isNotNull(reviews.id), isNotNull(listEntries.userId)));
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

/** Titles loved by members who love what this member loves, weighted by overlap. */
async function collaborativeScores(db: Db, userId: string) {
  const result = await db.execute(sql`
    with ${LOVED},
    mine as (select media_id from loved where user_id = ${userId}),
    neighbours as (
      select l.user_id, count(*)::int as overlap
      from loved l join mine using (media_id)
      where l.user_id <> ${userId}
      group by l.user_id
    )
    select l.media_id, sum(n.overlap)::int as weight, count(*)::int as fans
    from loved l join neighbours n using (user_id)
    where l.media_id not in (select media_id from mine)
    group by l.media_id
    order by weight desc
    limit 200
  `);
  return new Map(
    rowsOf(result).map((row) => [
      Number(row.media_id),
      { weight: Number(row.weight), fans: Number(row.fans) },
    ]),
  );
}

export interface Recommendation {
  row: MediaRow;
  score: number;
  reasons: string[];
}

export async function recommendFor(
  db: Db,
  userId: string,
  { type, limit }: { type?: "anime" | "manga" | undefined; limit: number },
) {
  const signals = await tasteSignals(db, userId);
  const seen = signals.map((signal) => signal.mediaId);

  const genreAffinity = new Map<string, number>();
  const tagAffinity = new Map<string, number>();
  // TV series vs movies vs one-shots: members tend to stick to the formats they enjoy.
  const formatAffinity = new Map<string, number>();
  for (const signal of signals) {
    const weight = signalWeight(signal.score, signal.status);
    if (signal.format) {
      formatAffinity.set(signal.format, (formatAffinity.get(signal.format) ?? 0) + weight);
    }
    for (const genre of signal.genres) {
      genreAffinity.set(genre, (genreAffinity.get(genre) ?? 0) + weight);
    }
    // Tags are stored most relevant first, so a title's top themes say the most.
    signal.tags.forEach((tag, rank) => {
      tagAffinity.set(tag, (tagAffinity.get(tag) ?? 0) + weight / (1 + rank / 3));
    });
  }
  normalise(genreAffinity);
  normalise(tagAffinity);
  normalise(formatAffinity);

  // Franchises the member loved, so sequels and adaptations can say so.
  const lovedFranchises = new Map<string, { title: string; type: "anime" | "manga" }>();
  for (const signal of signals) {
    if (signalWeight(signal.score, signal.status) >= 0.6) {
      lovedFranchises.set(franchiseKey(signal), {
        title: signal.titleEnglish ?? signal.titleRomaji,
        type: signal.type,
      });
    }
  }

  const collaborative = await collaborativeScores(db, userId);
  const maxCollab = Math.max(1, ...[...collaborative.values()].map((c) => c.weight));
  const likedGenres = [...genreAffinity].filter(([, v]) => v > 0.3).map(([g]) => g);

  // Candidates: titles matching liked genres, collaborative picks, or club favourites
  // (two or more reviews averaging "Go for it" or better).
  const reach: (SQL | undefined)[] = [
    sql`${media.clubReviewCount} >= 2 and ${media.clubScoreSum} >= ${CLUB_FAVOURITE} * ${media.clubReviewCount}`,
  ];
  if (likedGenres.length > 0) reach.push(arrayOverlaps(media.genres, likedGenres));
  if (collaborative.size > 0) reach.push(inArray(media.id, [...collaborative.keys()]));
  const coldStart = signals.length === 0;

  const candidates = await db
    .select()
    .from(media)
    .where(
      and(
        eq(media.isAdult, false),
        seen.length > 0 ? notInArray(media.id, seen) : undefined,
        type ? eq(media.type, type) : undefined,
        coldStart ? undefined : or(...reach),
      ),
    )
    .orderBy(desc(media.popularity))
    .limit(400);

  const ranked: Recommendation[] = candidates.map((row) => {
    const genreScore =
      row.genres.reduce((sum, g) => sum + (genreAffinity.get(g) ?? 0), 0) /
      Math.sqrt(Math.max(1, row.genres.length));
    const tagScore =
      row.tags.reduce((sum, t) => sum + (tagAffinity.get(t) ?? 0), 0) /
      Math.sqrt(Math.max(1, row.tags.length));
    const formatScore = row.format ? (formatAffinity.get(row.format) ?? 0) : 0;
    const collab = collaborative.get(row.id);
    const collabScore = collab ? collab.weight / maxCollab : 0;
    const quality = (row.anilistScore ?? 60) / 100;
    const club = clubAverage(row);
    // The club average runs 1-4; centre it so "Timepass/Go for it" (2.5) is neutral.
    const clubScore = club !== null && row.clubReviewCount >= 2 ? (club - 2.5) / 1.5 : 0;
    const popularity = Math.min(1, Math.log10((row.popularity ?? 0) + 1) / 6);
    const lovedSeries = lovedFranchises.get(franchiseKey(row));

    const score =
      0.7 * genreScore +
      1.0 * tagScore +
      0.4 * formatScore +
      1.5 * collabScore +
      0.5 * quality +
      0.3 * clubScore +
      0.15 * popularity +
      (lovedSeries ? 0.8 : 0);

    const reasons: string[] = [];
    if (lovedSeries) {
      reasons.push(
        lovedSeries.type === row.type
          ? `More ${lovedSeries.title}, which you loved`
          : `The ${row.type} of ${lovedSeries.title}, which you loved`,
      );
    }
    if (collab) {
      reasons.push(
        collab.fans === 1
          ? "A member with similar taste loved this"
          : `${collab.fans} members with similar taste loved this`,
      );
    }
    // Name the taste it matches: specific themes when there are two, else genres.
    const themes = row.tags
      .filter((t) => !GENERIC_TAG.test(t) && (tagAffinity.get(t) ?? 0) > 0.3)
      .sort((a, b) => (tagAffinity.get(b) ?? 0) - (tagAffinity.get(a) ?? 0))
      .slice(0, 2);
    const genres = row.genres
      .filter((g) => (genreAffinity.get(g) ?? 0) > 0.3)
      .sort((a, b) => (genreAffinity.get(b) ?? 0) - (genreAffinity.get(a) ?? 0))
      .slice(0, 2);
    if (themes.length === 2) reasons.push(`Because you like ${joinWords(themes)} stories`);
    else if (genres.length > 0) reasons.push(`Because you enjoy ${joinWords(genres)}`);
    if (club !== null && club >= CLUB_FAVOURITE && row.clubReviewCount >= 2) {
      reasons.push(`Club favourite: the club says ${RATING_LABELS[valueToRating(club)]}`);
    }
    if (reasons.length === 0) reasons.push("Popular and highly rated");

    return { row, score, reasons };
  });

  ranked.sort((a, b) => b.score - a.score || a.row.id - b.row.id);
  return {
    items: onePerFranchise(ranked, limit),
    basedOn: {
      reviews: signals.filter((s) => s.score !== null).length,
      listEntries: signals.filter((s) => s.status !== null).length,
    },
  };
}

function jaccard(a: string[], b: string[]) {
  if (a.length === 0 && b.length === 0) return 0;
  const setB = new Set(b);
  const shared = a.filter((x) => setB.has(x)).length;
  return shared / (a.length + b.length - shared);
}

/**
 * How much of `target`'s themes `candidate` shares, from 0 to 1. Tags are stored most
 * relevant first (AniList's rank), so a shared top tag like "Military" counts for more
 * than a shared minor one like "Primarily Teen Cast".
 */
export function tagSimilarity(candidate: string[], target: string[]) {
  if (target.length === 0) return 0;
  const have = new Set(candidate);
  let shared = 0;
  let total = 0;
  target.forEach((tag, rank) => {
    const weight = 1 / (1 + rank / 3);
    total += weight;
    if (have.has(tag)) shared += weight;
  });
  return shared / total;
}

/** Titles like this one: co-loved by members first, then shared themes and genres. */
export async function similarTo(db: Db, mediaId: number, limit: number) {
  const target = await getMedia(db, mediaId);
  if (!target) throw new AppError(404, "MEDIA_NOT_FOUND", "No anime or manga with that id.");

  const coLoved = new Map(
    rowsOf(
      await db.execute(sql`
        with ${LOVED}
        select b.media_id, count(*)::int as fans
        from loved a join loved b on a.user_id = b.user_id and b.media_id <> a.media_id
        where a.media_id = ${mediaId}
        group by b.media_id
        order by fans desc
        limit 100
      `),
    ).map((row) => [Number(row.media_id), Number(row.fans)]),
  );
  const maxFans = Math.max(1, ...coLoved.values());

  const reach: (SQL | undefined)[] = [];
  if (target.genres.length > 0) reach.push(arrayOverlaps(media.genres, target.genres));
  if (coLoved.size > 0) reach.push(inArray(media.id, [...coLoved.keys()]));
  if (reach.length === 0) return [];

  const candidates = await db
    .select()
    .from(media)
    .where(
      and(
        eq(media.isAdult, false),
        eq(media.type, target.type),
        ne(media.id, target.id),
        or(...reach),
      ),
    )
    .orderBy(desc(media.popularity))
    .limit(300);

  const targetFranchise = franchiseKey(target);
  const targetTitle = target.titleEnglish ?? target.titleRomaji;

  const ranked = candidates
    .filter((row) => franchiseKey(row) !== targetFranchise)
    .map((row) => {
      const fans = coLoved.get(row.id) ?? 0;
      const genreOverlap = jaccard(row.genres, target.genres);
      const tagOverlap = tagSimilarity(row.tags, target.tags);
      // A TV series is a better suggestion for a TV series than a spin-off movie is.
      const sameFormat = row.format !== null && row.format === target.format ? 1 : 0;
      const score =
        2.0 * (fans / maxFans) +
        0.7 * genreOverlap +
        1.3 * tagOverlap +
        0.15 * sameFormat +
        0.2 * ((row.anilistScore ?? 60) / 100);

      // Name what they share: themes when there are a couple in common, else genres.
      const sharedTags = target.tags
        .filter((t) => !GENERIC_TAG.test(t) && row.tags.includes(t))
        .slice(0, 3);
      const sharedGenres = row.genres.filter((g) => target.genres.includes(g)).slice(0, 3);
      const reasons =
        fans > 0
          ? [
              fans === 1
                ? `A member who loved ${targetTitle} also loved this`
                : `${fans} members who loved ${targetTitle} also loved this`,
            ]
          : sharedTags.length >= 2
            ? [`Also has ${joinWords(sharedTags)}`]
            : [`Also ${joinWords(sharedGenres)}`];
      return { row, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.row.id - b.row.id);

  return onePerFranchise(ranked, limit);
}

export function toRecommendationJson({ row, reasons }: { row: MediaRow; reasons: string[] }) {
  return { media: toMediaSummary(row), reasons };
}
