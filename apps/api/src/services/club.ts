import { type SQL, and, desc, eq, sql } from "drizzle-orm";

import type { Db } from "../db/client.js";
import { clubSuggestions, media, users } from "../db/schema/index.js";
import { decodeCursor, encodeCursor } from "../lib/cursor.js";
import { isUniqueViolation } from "../lib/db-errors.js";
import { AppError } from "../lib/errors.js";
import { isMonday } from "../lib/week.js";
import { toMediaSummary } from "./media.js";

const notFound = () =>
  new AppError(404, "SUGGESTION_NOT_FOUND", "That club suggestion doesn't exist.");

function selectSuggestions(db: Db) {
  return db
    .select({
      suggestion: clubSuggestions,
      title: media,
      suggestedBy: {
        username: users.username,
        displayUsername: users.displayUsername,
        image: users.image,
      },
    })
    .from(clubSuggestions)
    .innerJoin(media, eq(media.id, clubSuggestions.mediaId))
    .leftJoin(users, eq(users.id, clubSuggestions.suggestedById))
    .$dynamic();
}

type SuggestionRow = Awaited<ReturnType<typeof selectSuggestions>>[number];

export function toSuggestionJson({ suggestion, title, suggestedBy }: SuggestionRow) {
  return {
    id: suggestion.id,
    weekStart: suggestion.weekStart,
    note: suggestion.note,
    createdAt: suggestion.createdAt,
    // Null once the admin who suggested it has deleted their account.
    suggestedBy: suggestedBy?.username ? suggestedBy : null,
    media: toMediaSummary(title),
  };
}

/** One week's suggestions, oldest first (the order admins added them). */
export async function suggestionsForWeek(db: Db, weekStart: string) {
  const rows = await selectSuggestions(db)
    .where(and(eq(clubSuggestions.weekStart, weekStart), eq(media.isAdult, false)))
    .orderBy(clubSuggestions.createdAt, clubSuggestions.id);
  return rows.map(toSuggestionJson);
}

/**
 * Every suggestion up to `throughWeek` (this week), newest week first, for the archive.
 * Weeks leads have planned ahead stay private until they arrive.
 */
export async function suggestionArchive(
  db: Db,
  limit: number,
  throughWeek: string,
  cursor?: string,
) {
  const conditions: (SQL | undefined)[] = [
    eq(media.isAdult, false),
    sql`${clubSuggestions.weekStart} <= ${throughWeek}::date`,
  ];
  if (cursor) {
    const [week, id] = decodeCursor(cursor);
    if (typeof week !== "string" || !isMonday(week) || typeof id !== "string") {
      throw new AppError(400, "INVALID_CURSOR", "That page link is invalid or expired.");
    }
    conditions.push(
      sql`(${clubSuggestions.weekStart}, ${clubSuggestions.id}) < (${week}::date, ${id}::uuid)`,
    );
  }
  const rows = await selectSuggestions(db)
    .where(and(...conditions))
    .orderBy(desc(clubSuggestions.weekStart), desc(clubSuggestions.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(toSuggestionJson),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor([last.suggestion.weekStart, last.suggestion.id])
        : null,
  };
}

async function getSuggestion(db: Db, id: string) {
  const [row] = await selectSuggestions(db).where(eq(clubSuggestions.id, id));
  if (!row) throw notFound();
  return toSuggestionJson(row);
}

export async function addSuggestion(
  db: Db,
  adminId: string,
  input: { mediaId: number; weekStart: string; note?: string | null | undefined },
) {
  const [title] = await db
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.id, input.mediaId), eq(media.isAdult, false)));
  if (!title) throw new AppError(404, "MEDIA_NOT_FOUND", "No anime or manga with that id.");

  try {
    const [created] = await db
      .insert(clubSuggestions)
      .values({
        mediaId: input.mediaId,
        weekStart: input.weekStart,
        note: input.note ?? null,
        suggestedById: adminId,
      })
      .returning({ id: clubSuggestions.id });
    if (!created) throw new Error("insert returned no row");
    return await getSuggestion(db, created.id);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(
        409,
        "ALREADY_SUGGESTED",
        "That title is already suggested for this week.",
      );
    }
    throw err;
  }
}

export async function updateSuggestionNote(db: Db, id: string, note: string | null) {
  const updated = await db
    .update(clubSuggestions)
    .set({ note })
    .where(eq(clubSuggestions.id, id))
    .returning({ id: clubSuggestions.id });
  if (updated.length === 0) throw notFound();
  return getSuggestion(db, id);
}

export async function removeSuggestion(db: Db, id: string) {
  const removed = await db
    .delete(clubSuggestions)
    .where(eq(clubSuggestions.id, id))
    .returning({ id: clubSuggestions.id });
  if (removed.length === 0) throw notFound();
}
