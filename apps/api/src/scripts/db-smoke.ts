// Smoke-tests a freshly migrated, EMPTY database (CI runs it against real Postgres):
// extensions, triggers, constraints and cascades behave as the app expects.
// Never point this at a database with real data: it inserts and deletes rows.
import assert from "node:assert/strict";

import { eq, sql } from "drizzle-orm";

import { createDb } from "../db/client.js";
import { media, reviewLikes, reviews, users } from "../db/schema/index.js";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set");

const { db, close } = createDb(url);

try {
  const [{ count } = { count: -1 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);
  assert.equal(count, 0, "db-smoke must run against an empty database");

  const [ext] = await db
    .execute<{ extname: string }>(sql`select extname from pg_extension where extname = 'pg_trgm'`)
    .then((r) => (r as unknown as { rows: { extname: string }[] }).rows);
  assert.equal(ext?.extname, "pg_trgm", "pg_trgm extension is installed");

  await db.insert(users).values([
    { id: "smoke-a", name: "A", email: "a@smoke.test" },
    { id: "smoke-b", name: "B", email: "b@smoke.test" },
  ]);
  const [title] = await db
    .insert(media)
    .values({ anilistId: 1, type: "anime", titleRomaji: "Smoke Test" })
    .returning();
  assert.ok(title);

  const [review] = await db
    .insert(reviews)
    .values({ userId: "smoke-a", mediaId: title.id, score: 3, body: "Smoke test review" })
    .returning();
  assert.ok(review);
  await db
    .insert(reviews)
    .values({ userId: "smoke-b", mediaId: title.id, score: 2, body: "Another review" });
  await db.insert(reviewLikes).values({ userId: "smoke-b", reviewId: review.id });

  const read = async () => {
    const [m] = await db.select().from(media).where(eq(media.id, title.id));
    const [r] = await db.select().from(reviews).where(eq(reviews.id, review.id));
    return { reviews: m?.clubReviewCount, sum: m?.clubScoreSum, likes: r?.likeCount };
  };
  assert.deepEqual(
    await read(),
    { reviews: 2, sum: 5, likes: 1 },
    "triggers count reviews and likes",
  );

  await db.update(reviews).set({ score: 4 }).where(eq(reviews.id, review.id));
  assert.deepEqual(await read(), { reviews: 2, sum: 6, likes: 1 }, "verdict edits update the sum");

  await db.delete(users).where(eq(users.id, "smoke-b"));
  assert.deepEqual(await read(), { reviews: 1, sum: 4, likes: 0 }, "cascades keep counts right");

  await assert.rejects(
    db
      .insert(reviews)
      .values({ userId: "smoke-a", mediaId: title.id, score: 5, body: "Not a verdict" }),
    "verdicts are 1-4",
  );

  const hits = await db
    .select()
    .from(media)
    .where(sql`${media.titleRomaji} ilike ${"%moke%"}`);
  assert.equal(hits.length, 1, "trigram-indexed title search works");

  await db.delete(users).where(eq(users.id, "smoke-a"));
  await db.delete(media).where(eq(media.id, title.id));
  console.log("db-smoke: all checks passed");
} finally {
  await close();
}
