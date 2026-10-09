import { type SQL, and, desc, eq, inArray, sql } from "drizzle-orm";

import type { Db } from "../db/client.js";
import { listEntries, listStatus, media, users } from "../db/schema/index.js";
import { type AnilistClient, type AnilistListEntry, toMediaRow } from "../lib/anilist.js";
import { decodeCursor, encodeCursor } from "../lib/cursor.js";
import { AppError } from "../lib/errors.js";
import { type MediaRow, toMediaSummary, upsertMedia } from "./media.js";

export const LIST_STATUSES = listStatus.enumValues;
export type ListStatus = (typeof LIST_STATUSES)[number];

type EntryRow = typeof listEntries.$inferSelect;

/** Episodes for anime, chapters for manga; null when AniList doesn't know yet. */
function totalOf(row: Pick<MediaRow, "type" | "episodes" | "chapters">) {
  return row.type === "anime" ? row.episodes : row.chapters;
}

export function toListEntryJson(entry: EntryRow, title: MediaRow) {
  return {
    status: entry.status,
    progress: entry.progress,
    // entry.score (from an imported list) stays private: it only shapes suggestions.
    total: totalOf(title),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    media: toMediaSummary(title),
  };
}

export async function findUserIdByUsername(db: Db, username: string) {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username.toLowerCase()));
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "No member with that username.");
  return user.id;
}

export interface ListParams {
  userId: string;
  status?: ListStatus | undefined;
  type?: "anime" | "manga" | undefined;
  limit: number;
  cursor?: string | undefined;
}

/** A member's list, most recently updated first. */
export async function listEntriesOf(db: Db, params: ListParams) {
  const conditions: (SQL | undefined)[] = [
    eq(listEntries.userId, params.userId),
    eq(media.isAdult, false),
  ];
  if (params.status) conditions.push(eq(listEntries.status, params.status));
  if (params.type) conditions.push(eq(media.type, params.type));
  if (params.cursor) {
    const [value, mediaId] = decodeCursor(params.cursor);
    if (typeof value !== "string" || typeof mediaId !== "number") {
      throw new AppError(400, "INVALID_CURSOR", "That page link is invalid or expired.");
    }
    conditions.push(
      sql`(${listEntries.updatedAt}, ${listEntries.mediaId}) < (${value}::timestamptz, ${mediaId}::int)`,
    );
  }

  const rows = await db
    .select({
      entry: listEntries,
      title: media,
      // Microsecond-exact, for cursors (see services/reviews.ts).
      updatedAtExact: sql<string>`to_char(${listEntries.updatedAt} at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    })
    .from(listEntries)
    .innerJoin(media, eq(media.id, listEntries.mediaId))
    .where(and(...conditions))
    .orderBy(desc(listEntries.updatedAt), desc(listEntries.mediaId))
    .limit(params.limit + 1);

  const page = rows.slice(0, params.limit);
  const last = page.at(-1);
  return {
    items: page.map(({ entry, title }) => toListEntryJson(entry, title)),
    nextCursor:
      rows.length > params.limit && last
        ? encodeCursor([last.updatedAtExact, last.entry.mediaId])
        : null,
  };
}

async function visibleTitle(db: Db, mediaId: number) {
  const [title] = await db
    .select()
    .from(media)
    .where(and(eq(media.id, mediaId), eq(media.isAdult, false)));
  if (!title) throw new AppError(404, "MEDIA_NOT_FOUND", "No anime or manga with that id.");
  return title;
}

export async function getEntry(db: Db, userId: string, mediaId: number) {
  const [row] = await db
    .select({ entry: listEntries, title: media })
    .from(listEntries)
    .innerJoin(media, eq(media.id, listEntries.mediaId))
    .where(and(eq(listEntries.userId, userId), eq(listEntries.mediaId, mediaId)));
  return row ? toListEntryJson(row.entry, row.title) : null;
}

/**
 * Adds or updates a title on the member's list. Progress can't pass the known
 * episode/chapter count, and "completed" fills progress in when it's left out.
 */
export async function saveEntry(
  db: Db,
  userId: string,
  mediaId: number,
  input: { status: ListStatus; progress?: number | undefined },
) {
  const title = await visibleTitle(db, mediaId);
  const total = totalOf(title);

  if (input.progress !== undefined && total !== null && input.progress > total) {
    const unit = title.type === "anime" ? "episodes" : "chapters";
    throw new AppError(400, "PROGRESS_TOO_HIGH", `This title only has ${total} ${unit}.`);
  }
  const progress =
    input.progress ?? (input.status === "completed" && total !== null ? total : undefined);

  const [entry] = await db
    .insert(listEntries)
    .values({ userId, mediaId, status: input.status, ...(progress !== undefined && { progress }) })
    .onConflictDoUpdate({
      target: [listEntries.userId, listEntries.mediaId],
      set: {
        status: input.status,
        ...(progress !== undefined && { progress }),
        updatedAt: sql`now()`,
      },
    })
    .returning();
  if (!entry) throw new Error("upsert returned no row");
  return toListEntryJson(entry, title);
}

export async function removeEntry(db: Db, userId: string, mediaId: number) {
  const removed = await db
    .delete(listEntries)
    .where(and(eq(listEntries.userId, userId), eq(listEntries.mediaId, mediaId)))
    .returning({ mediaId: listEntries.mediaId });
  if (removed.length === 0) {
    throw new AppError(404, "NOT_ON_LIST", "That title isn't on your list.");
  }
}

/** AniList statuses we keep; "Planning" has no equivalent here, so it's skipped. */
const FROM_ANILIST: Partial<Record<AnilistListEntry["status"], ListStatus>> = {
  CURRENT: "current",
  REPEATING: "current",
  COMPLETED: "completed",
  PAUSED: "paused",
  DROPPED: "dropped",
};

export interface ImportSummary {
  imported: { anime: number; manga: number };
  skipped: { planning: number; adult: number };
}

/**
 * Copies a member's AniList anime and manga lists onto their list here: titles join the
 * catalog, and each entry keeps its status, progress and score (the score shapes their
 * suggestions). Re-importing updates entries; nothing already on their list is removed.
 */
export async function importFromAnilist(
  db: Db,
  anilist: AnilistClient,
  userId: string,
  anilistUsername: string,
): Promise<ImportSummary> {
  const [anime, manga] = [
    await anilist.userList(anilistUsername, "ANIME"),
    await anilist.userList(anilistUsername, "MANGA"),
  ];
  if (anime === null && manga === null) {
    throw new AppError(
      404,
      "ANILIST_USER_NOT_FOUND",
      "We couldn't find that AniList user, or their list is private.",
    );
  }

  const summary: ImportSummary = {
    imported: { anime: 0, manga: 0 },
    skipped: { planning: 0, adult: 0 },
  };
  // A title can sit in more than one of a member's custom lists; keep the first.
  const keep = new Map<number, { entry: AnilistListEntry; status: ListStatus }>();
  for (const entry of [...(anime ?? []), ...(manga ?? [])]) {
    const status = FROM_ANILIST[entry.status];
    if (!status) summary.skipped.planning++;
    else if (entry.media.isAdult) summary.skipped.adult++;
    else if (!keep.has(entry.media.id)) keep.set(entry.media.id, { entry, status });
  }
  if (keep.size === 0) return summary;

  // Titles first (in batches, well under Postgres's parameter limit), then the entries.
  const kept = [...keep.values()];
  const idByAnilistId = new Map<number, number>();
  for (let i = 0; i < kept.length; i += 400) {
    const rows = await upsertMedia(
      db,
      kept.slice(i, i + 400).map(({ entry }) => toMediaRow(entry.media)),
    );
    for (const row of rows) idByAnilistId.set(row.anilistId, row.id);
  }

  const values = kept.flatMap(({ entry, status }) => {
    const mediaId = idByAnilistId.get(entry.media.id);
    if (mediaId === undefined) return [];
    const score = entry.score && entry.score > 0 ? Math.min(100, Math.round(entry.score)) : null;
    summary.imported[entry.media.type === "ANIME" ? "anime" : "manga"]++;
    return [{ userId, mediaId, status, progress: Math.max(0, entry.progress ?? 0), score }];
  });
  for (let i = 0; i < values.length; i += 1_000) {
    await db
      .insert(listEntries)
      .values(values.slice(i, i + 1_000))
      .onConflictDoUpdate({
        target: [listEntries.userId, listEntries.mediaId],
        set: {
          status: sql`excluded.status`,
          progress: sql`excluded.progress`,
          score: sql`excluded.score`,
          updatedAt: sql`now()`,
        },
      });
  }
  return summary;
}

/**
 * Adds several titles to a member's list at once (a typed list). Adult or unknown titles
 * are skipped; titles already on the list take the new status.
 */
export async function addManyToList(
  db: Db,
  userId: string,
  items: { mediaId: number; status: ListStatus }[],
) {
  const wanted = new Map(items.map((item) => [item.mediaId, item.status]));
  if (wanted.size === 0) return { saved: 0 };
  const visible = await db
    .select({ id: media.id })
    .from(media)
    .where(and(inArray(media.id, [...wanted.keys()]), eq(media.isAdult, false)));
  if (visible.length === 0) return { saved: 0 };
  await db
    .insert(listEntries)
    .values(
      visible.map(({ id }) => ({ userId, mediaId: id, status: wanted.get(id) ?? "completed" })),
    )
    .onConflictDoUpdate({
      target: [listEntries.userId, listEntries.mediaId],
      set: { status: sql`excluded.status`, updatedAt: sql`now()` },
    });
  return { saved: visible.length };
}
