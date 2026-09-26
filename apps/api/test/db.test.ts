// Runs the real migrations against an in-memory Postgres (PGlite) and checks
// that the database itself enforces the rules the API relies on.
import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  clubSuggestions,
  follows,
  listEntries,
  media,
  reviewLikes,
  reviews,
  users,
} from "../src/db/schema/index.js";
import { type TestDb, createTestDb } from "./test-db.js";

let client: PGlite;
let db: TestDb;

beforeAll(async () => {
  ({ client, db } = await createTestDb());
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await client.exec("truncate users, media restart identity cascade");
});

async function seedBasics() {
  await db.insert(users).values([
    { id: "u1", name: "Luffy", email: "luffy@example.com" },
    { id: "u2", name: "Zoro", email: "zoro@example.com" },
  ]);
  const [onePiece] = await db
    .insert(media)
    .values({ anilistId: 21, type: "anime", titleRomaji: "ONE PIECE" })
    .returning();
  if (!onePiece) throw new Error("insert failed");
  return { mediaId: onePiece.id };
}

/** Resolves to the Postgres error message a statement fails with. */
async function failureOf(statement: PromiseLike<unknown>): Promise<string> {
  try {
    await statement;
  } catch (err) {
    const cause = (err as { cause?: { message?: string } }).cause;
    return cause?.message ?? (err as Error).message;
  }
  throw new Error("expected the statement to fail");
}

describe("database schema", () => {
  it("fills defaults for new users", async () => {
    await seedBasics();

    const [user] = await db.select().from(users).where(eq(users.id, "u1"));

    expect(user).toMatchObject({ role: "user", banned: false, emailVerified: false });
    expect(user?.createdAt).toBeInstanceOf(Date);
  });

  it("allows one review per user per title", async () => {
    const { mediaId } = await seedBasics();
    await db.insert(reviews).values({ userId: "u1", mediaId, score: 4, body: "Peak." });

    expect(
      await failureOf(
        db.insert(reviews).values({ userId: "u1", mediaId, score: 3, body: "Again" }),
      ),
    ).toMatch(/reviews_user_id_media_id_unique/);
  });

  it.each([0, 5])("rejects a review score of %i (verdicts are 1-4)", async (score) => {
    const { mediaId } = await seedBasics();

    expect(
      await failureOf(db.insert(reviews).values({ userId: "u1", mediaId, score, body: "Hmm" })),
    ).toMatch(/reviews_score_range/);
  });

  it("rejects an empty review body", async () => {
    const { mediaId } = await seedBasics();

    expect(
      await failureOf(db.insert(reviews).values({ userId: "u1", mediaId, score: 2, body: "" })),
    ).toMatch(/reviews_body_length/);
  });

  it("stops users following themselves", async () => {
    await seedBasics();

    expect(
      await failureOf(db.insert(follows).values({ followerId: "u1", followingId: "u1" })),
    ).toMatch(/follows_not_self/);
  });

  it("rejects negative list progress", async () => {
    const { mediaId } = await seedBasics();

    expect(
      await failureOf(
        db.insert(listEntries).values({ userId: "u1", mediaId, status: "current", progress: -1 }),
      ),
    ).toMatch(/list_entries_progress_non_negative/);
  });

  it("only accepts club suggestions dated on a Monday", async () => {
    const { mediaId } = await seedBasics();

    await db.insert(clubSuggestions).values({ mediaId, weekStart: "2026-09-21" }); // Monday
    expect(
      await failureOf(db.insert(clubSuggestions).values({ mediaId, weekStart: "2026-09-23" })),
    ).toMatch(/club_suggestions_week_is_monday/);
  });

  it("removes a user's content when the user is deleted", async () => {
    const { mediaId } = await seedBasics();
    const [review] = await db
      .insert(reviews)
      .values({ userId: "u2", mediaId, score: 3, body: "Great fights" })
      .returning();
    if (!review) throw new Error("insert failed");
    await db.insert(reviewLikes).values({ userId: "u1", reviewId: review.id });
    await db.insert(listEntries).values({ userId: "u1", mediaId, status: "completed" });
    await db.insert(follows).values({ followerId: "u1", followingId: "u2" });
    await db
      .insert(clubSuggestions)
      .values({ mediaId, suggestedById: "u1", weekStart: "2026-09-21" });

    await db.delete(users).where(eq(users.id, "u1"));

    expect(await db.select().from(reviewLikes)).toHaveLength(0);
    expect(await db.select().from(listEntries)).toHaveLength(0);
    expect(await db.select().from(follows)).toHaveLength(0);
    expect(await db.select().from(reviews)).toHaveLength(1); // u2's review stays
    const [suggestion] = await db.select().from(clubSuggestions);
    expect(suggestion?.suggestedById).toBeNull(); // the suggestion outlives its author
  });

  it("loads relations through the query API", async () => {
    const { mediaId } = await seedBasics();
    await db.insert(reviews).values({ userId: "u1", mediaId, score: 4, body: "Peak." });

    const result = await db.query.media.findFirst({
      where: eq(media.id, mediaId),
      with: { reviews: { with: { user: true } } },
    });

    expect(result?.reviews[0]?.user.name).toBe("Luffy");
  });
});
