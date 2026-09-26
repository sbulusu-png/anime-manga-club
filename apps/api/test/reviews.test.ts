import { eq, sql } from "drizzle-orm";
import type { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { media, reviews, users } from "../src/db/schema/index.js";
import { toMediaRow } from "../src/lib/anilist.js";
import type { ErrorBody } from "../src/lib/errors.js";
import type { Rating } from "../src/lib/rating.js";
import { cleanReviewBody } from "../src/routes/reviews.js";
import { upsertMedia } from "../src/services/media.js";
import type { AppEnv } from "../src/types.js";
import { anilistMedia } from "./fake-anilist.js";
import { makeApp } from "./helpers.js";
import { createMember, send } from "./session.js";
import { type TestDb, createTestDb } from "./test-db.js";

interface Review {
  id: string;
  rating: string;
  body: string;
  hasSpoilers: boolean;
  likeCount: number;
  likedByMe: boolean;
  edited: boolean;
  author: { username: string | null; displayUsername: string | null };
  media: { id: number; title: string };
}
interface Feed {
  items: Review[];
  nextCursor: string | null;
}
type Member = Awaited<ReturnType<typeof createMember>>;

let db: TestDb;
let app: Hono<AppEnv>;
let onePiece: number;
let bleach: number;
let adultTitle: number;
let alice: Member, bob: Member, carol: Member, dave: Member, noName: Member;

const GOOD_BODY = "A genuinely great adventure with heart.";

beforeAll(async () => {
  ({ db } = await createTestDb());
  ({ app } = makeApp(db));
  const rows = await upsertMedia(
    db,
    [
      anilistMedia(1, { title: { romaji: "One Piece", english: null, native: null } }),
      anilistMedia(2, { title: { romaji: "Bleach", english: null, native: null } }),
      anilistMedia(3, { title: { romaji: "Adult", english: null, native: null }, isAdult: true }),
    ].map(toMediaRow),
  );
  [onePiece, bleach, adultTitle] = rows.map((row) => row.id) as [number, number, number];

  alice = await createMember(app, "Alice");
  bob = await createMember(app, "Bob");
  carol = await createMember(app, "Carol");
  dave = await createMember(app, "Dave");
  noName = await createMember(app, "NoName", { username: null });
  await db.update(users).set({ role: "admin" }).where(eq(users.id, dave.id));
});

beforeEach(async () => {
  await db.delete(reviews);
  // A fresh app per test resets the per-member write limit; sessions stay valid
  // because they live in the database.
  ({ app } = makeApp(db));
});

async function post(member: Member, body: Record<string, unknown>) {
  return send(app, "POST", "/api/reviews", { cookie: member.cookie, body });
}
async function write(member: Member, mediaId: number, rating: Rating, body = GOOD_BODY) {
  const res = await post(member, { mediaId, rating, body });
  expect(res.status).toBe(201);
  return ((await res.json()) as { item: Review }).item;
}
async function errorCode(res: Response) {
  return ((await res.json()) as ErrorBody).error.code;
}
async function feed(query: string, cookie = "") {
  const res = await send(app, "GET", `/api/reviews${query}`, { cookie });
  expect(res.status).toBe(200);
  return (await res.json()) as Feed;
}
async function clubOf(mediaId: number) {
  const res = await send(app, "GET", `/api/media/${mediaId}`);
  return ((await res.json()) as { item: { club: Record<string, unknown> } }).item.club;
}

describe("writing reviews", () => {
  it("creates a review with its author and title", async () => {
    const review = await write(alice, onePiece, "perfection");

    expect(review).toMatchObject({
      rating: "perfection",
      body: GOOD_BODY,
      hasSpoilers: false,
      likeCount: 0,
      likedByMe: false,
      edited: false,
      author: { username: "alice", displayUsername: "alice" },
      media: { id: onePiece, title: "One Piece" },
    });
    // Google accounts carry real names; reviews only ever show the username.
    expect(review.author).not.toHaveProperty("name");
  });

  it("allows only one review per member per title", async () => {
    await write(alice, onePiece, "perfection");

    const again = await post(alice, { mediaId: onePiece, rating: "skip", body: GOOD_BODY });
    expect(again.status).toBe(409);
    expect(await errorCode(again)).toBe("REVIEW_EXISTS");
  });

  it.each([
    ["an unknown verdict", { rating: "masterpiece" }],
    ["a numeric score", { rating: 9 }],
    ["a missing verdict", { rating: undefined }],
    ["a body under 10 characters", { body: "Too short" }],
    ["a body that is only padding", { body: " \n\n  short \n\n " }],
    ["a body over 10,000 characters", { body: "x".repeat(10_001) }],
    ["an unknown field (like the old 1-10 score)", { score: 8 }],
    ["a missing title", { mediaId: undefined }],
  ])("rejects %s", async (_name, change) => {
    const res = await post(alice, {
      mediaId: onePiece,
      rating: "go_for_it",
      body: GOOD_BODY,
      ...change,
    });

    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe("VALIDATION_ERROR");
  });

  it.each([
    ["unknown titles", 999_999],
    ["adult titles", "adult"],
  ])("answers 404 for %s", async (_name, id) => {
    const mediaId = id === "adult" ? adultTitle : id;
    const res = await post(alice, { mediaId, rating: "go_for_it", body: GOOD_BODY });

    expect(res.status).toBe(404);
  });

  it("requires signing in, and a username", async () => {
    const anon = await send(app, "POST", "/api/reviews", {
      body: { mediaId: onePiece, rating: "go_for_it", body: GOOD_BODY },
    });
    expect(anon.status).toBe(401);

    const res = await post(noName, { mediaId: onePiece, rating: "go_for_it", body: GOOD_BODY });
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe("USERNAME_REQUIRED");
  });

  it("stores the review text cleaned up", async () => {
    const review = await write(
      alice,
      onePiece,
      "go_for_it",
      "  First line\r\nsecond line\u0000\u200B\n\n\n\n\nnew paragraph   \n  ",
    );

    expect(review.body).toBe("First line\nsecond line\n\nnew paragraph");
  });
});

describe("cleanReviewBody", () => {
  it("keeps emoji, accents and Japanese text intact", () => {
    expect(cleanReviewBody("Peak fiction 🔥 — ワンピース は最高！ Café")).toBe(
      "Peak fiction 🔥 — ワンピース は最高！ Café",
    );
  });
});

describe("editing and deleting", () => {
  it("lets the author edit, and marks the review as edited", async () => {
    const { id } = await write(alice, onePiece, "perfection");

    const res = await send(app, "PATCH", `/api/reviews/${id}`, {
      cookie: alice.cookie,
      body: { rating: "go_for_it", hasSpoilers: true },
    });

    expect(res.status).toBe(200);
    expect(((await res.json()) as { item: Review }).item).toMatchObject({
      rating: "go_for_it",
      hasSpoilers: true,
      body: GOOD_BODY,
      edited: true,
    });
  });

  it("stops anyone else editing, even an admin", async () => {
    const { id } = await write(alice, onePiece, "perfection");

    for (const member of [bob, dave]) {
      const res = await send(app, "PATCH", `/api/reviews/${id}`, {
        cookie: member.cookie,
        body: { rating: "skip" },
      });
      expect(res.status).toBe(403);
    }
  });

  it("rejects empty edits, bad ids and unknown reviews", async () => {
    const { id } = await write(alice, onePiece, "perfection");
    const patch = (path: string, body: unknown) =>
      send(app, "PATCH", path, { cookie: alice.cookie, body });

    expect((await patch(`/api/reviews/${id}`, {})).status).toBe(400);
    expect((await patch("/api/reviews/not-a-uuid", { rating: "timepass" })).status).toBe(400);
    expect(
      (await patch("/api/reviews/00000000-0000-4000-8000-000000000000", { rating: "timepass" }))
        .status,
    ).toBe(404);
  });

  it("lets the author or an admin delete, but nobody else", async () => {
    const first = await write(alice, onePiece, "perfection");
    const second = await write(alice, bleach, "go_for_it");
    const del = (id: string, member: Member) =>
      send(app, "DELETE", `/api/reviews/${id}`, { cookie: member.cookie });

    expect((await del(first.id, bob)).status).toBe(403);
    expect((await del(first.id, alice)).status).toBe(204);
    expect((await del(second.id, dave)).status).toBe(204); // admin moderation
    expect((await send(app, "GET", `/api/reviews/${first.id}`)).status).toBe(404);
  });
});

describe("likes", () => {
  it("counts likes, knows who liked, and is idempotent", async () => {
    const { id } = await write(alice, onePiece, "perfection");
    const like = (member: Member, method: "PUT" | "DELETE") =>
      send(app, method, `/api/reviews/${id}/like`, { cookie: member.cookie });

    expect(await (await like(bob, "PUT")).json()).toEqual({ liked: true, likeCount: 1 });
    expect(await (await like(bob, "PUT")).json()).toEqual({ liked: true, likeCount: 1 });
    await like(carol, "PUT");

    const view = async (cookie: string) =>
      (
        (await (await send(app, "GET", `/api/reviews/${id}`, { cookie })).json()) as {
          item: Review;
        }
      ).item;
    expect(await view(bob.cookie)).toMatchObject({ likeCount: 2, likedByMe: true });
    expect(await view(dave.cookie)).toMatchObject({ likeCount: 2, likedByMe: false });
    expect(await view("")).toMatchObject({ likeCount: 2, likedByMe: false });

    expect(await (await like(bob, "DELETE")).json()).toEqual({ liked: false, likeCount: 1 });
    expect(await (await like(bob, "DELETE")).json()).toEqual({ liked: false, likeCount: 1 });
  });

  it("doesn't let authors like their own review", async () => {
    const { id } = await write(alice, onePiece, "perfection");

    const res = await send(app, "PUT", `/api/reviews/${id}/like`, { cookie: alice.cookie });
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe("CANNOT_LIKE_OWN_REVIEW");
  });
});

describe("club verdict", () => {
  it("averages members' verdicts and follows edits and deletes", async () => {
    expect(await clubOf(onePiece)).toMatchObject({ verdict: null, average: null, reviewCount: 0 });

    const first = await write(alice, onePiece, "perfection"); // 4
    await write(bob, onePiece, "timepass"); // 2
    expect(await clubOf(onePiece)).toMatchObject({
      verdict: "go_for_it",
      average: 3,
      reviewCount: 2,
    });

    await send(app, "PATCH", `/api/reviews/${first.id}`, {
      cookie: alice.cookie,
      body: { rating: "skip" },
    });
    // (1 + 2) / 2 = 1.5, which rounds up to Timepass.
    expect(await clubOf(onePiece)).toMatchObject({
      verdict: "timepass",
      average: 1.5,
      reviewCount: 2,
    });

    await send(app, "DELETE", `/api/reviews/${first.id}`, { cookie: alice.cookie });
    expect(await clubOf(onePiece)).toMatchObject({
      verdict: "timepass",
      average: 2,
      reviewCount: 1,
    });
  });

  it("counts each verdict for the title page", async () => {
    await write(alice, bleach, "perfection");
    await write(bob, bleach, "perfection");
    await write(carol, bleach, "skip");

    expect(await clubOf(bleach)).toEqual({
      verdict: "go_for_it",
      average: 3,
      reviewCount: 3,
      breakdown: { skip: 1, timepass: 0, go_for_it: 0, perfection: 2 },
    });
  });

  it("sorts titles by club verdict, unreviewed last", async () => {
    await write(alice, bleach, "perfection");
    await write(alice, onePiece, "timepass");

    const res = await send(app, "GET", "/api/media?sort=club");
    const { items } = (await res.json()) as { items: { id: number }[] };
    expect(items.map((item) => item.id)).toEqual([bleach, onePiece]);
  });

  it("stays correct when a member deletes their account", async () => {
    const leaver = await createMember(app, "Leaver");
    const { id } = await write(alice, onePiece, "perfection");
    await write(leaver, onePiece, "skip");
    await send(app, "PUT", `/api/reviews/${id}/like`, { cookie: leaver.cookie });

    await db.delete(users).where(eq(users.id, leaver.id));

    expect(await clubOf(onePiece)).toMatchObject({
      verdict: "perfection",
      average: 4,
      reviewCount: 1,
    });
    const [row] = await db.select().from(reviews).where(eq(reviews.id, id));
    expect(row?.likeCount).toBe(0);
  });
});

describe("feeds", () => {
  it("lists the newest reviews first, and pages without gaps", async () => {
    await write(alice, onePiece, "perfection");
    await write(bob, onePiece, "go_for_it");
    await write(carol, bleach, "go_for_it");

    const all = await feed("");
    expect(all.items.map((r) => r.author.username)).toEqual(["carol", "bob", "alice"]);

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await feed(`?limit=1${cursor ? `&cursor=${cursor}` : ""}`);
      seen.push(...page.items.map((r) => r.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(all.items.map((r) => r.id));
  });

  it("never skips reviews posted within the same millisecond", async () => {
    // Five reviews whose timestamps differ only in microseconds.
    const members = [alice, bob, carol, dave];
    for (const [i, member] of members.entries()) {
      await db.insert(reviews).values({
        userId: member.id,
        mediaId: onePiece,
        score: 2,
        body: GOOD_BODY,
        createdAt: sql`'2026-01-01T00:00:00.123000Z'::timestamptz + ${i * 100} * interval '1 microsecond'`,
      });
    }

    const seen = new Set<string>();
    let cursor: string | null = null;
    do {
      const page = await feed(`?limit=1${cursor ? `&cursor=${cursor}` : ""}`);
      for (const review of page.items) seen.add(review.id);
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen.size).toBe(members.length);
  });

  it("ranks by likes for the top feed", async () => {
    const quiet = await write(alice, onePiece, "perfection");
    const popular = await write(bob, onePiece, "go_for_it");
    for (const fan of [alice, carol, dave]) {
      await send(app, "PUT", `/api/reviews/${popular.id}/like`, { cookie: fan.cookie });
    }
    await send(app, "PUT", `/api/reviews/${quiet.id}/like`, { cookie: carol.cookie });

    const top = await feed("?sort=top");
    expect(top.items.map((r) => [r.id, r.likeCount])).toEqual([
      [popular.id, 3],
      [quiet.id, 1],
    ]);

    const first = await feed("?sort=top&limit=1");
    const second = await feed(`?sort=top&limit=1&cursor=${first.nextCursor ?? ""}`);
    expect(second.items.map((r) => r.id)).toEqual([quiet.id]);
  });

  it("filters by title and by author (any capitalisation)", async () => {
    await write(alice, onePiece, "perfection");
    await write(alice, bleach, "go_for_it");
    await write(bob, bleach, "go_for_it");

    expect((await feed(`?mediaId=${bleach}`)).items).toHaveLength(2);
    expect((await feed("?user=ALICE")).items.map((r) => r.media.title)).toEqual([
      "Bleach",
      "One Piece",
    ]);
  });

  it("limits the top feed to a time period", async () => {
    const old = await write(alice, onePiece, "perfection");
    await write(bob, onePiece, "go_for_it");
    await db
      .update(reviews)
      .set({ createdAt: sql`now() - interval '10 days'` })
      .where(eq(reviews.id, old.id));

    expect((await feed("?sort=top&period=week")).items).toHaveLength(1);
    expect((await feed("?sort=top&period=month")).items).toHaveLength(2);
  });

  it("rejects tampered cursors and cursors from the other sort", async () => {
    await write(alice, onePiece, "perfection");
    await write(bob, onePiece, "go_for_it");
    const { nextCursor } = await feed("?limit=1");

    for (const query of ["?cursor=garbage", `?sort=top&cursor=${nextCursor ?? ""}`]) {
      const res = await send(app, "GET", `/api/reviews${query}`);
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe("INVALID_CURSOR");
    }
  });
});

describe("my review", () => {
  it("returns the member's own review of a title, or null", async () => {
    await write(alice, onePiece, "perfection");
    const mine = (member: Member, mediaId: number) =>
      send(app, "GET", `/api/reviews/mine?mediaId=${mediaId}`, { cookie: member.cookie });

    expect(await (await mine(alice, onePiece)).json()).toMatchObject({
      item: { rating: "perfection" },
    });
    expect(await (await mine(alice, bleach)).json()).toEqual({ item: null });
    expect((await send(app, "GET", `/api/reviews/mine?mediaId=${onePiece}`)).status).toBe(401);
  });
});

describe("write limits", () => {
  it("allows 30 writes a minute per member", async () => {
    const { id } = await write(alice, onePiece, "perfection");
    const spammer = await createMember(app, "Spammer");
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const method = i % 2 === 0 ? "PUT" : "DELETE";
      const res = await send(app, method, `/api/reviews/${id}/like`, { cookie: spammer.cookie });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
    // Other members are unaffected.
    const res = await send(app, "PUT", `/api/reviews/${id}/like`, { cookie: bob.cookie });
    expect(res.status).toBe(200);
  });
});

describe("database guarantees", () => {
  it("never lets a like count go negative", async () => {
    const { id } = await write(alice, onePiece, "perfection");

    await expect(
      db.update(reviews).set({ likeCount: -1 }).where(eq(reviews.id, id)),
    ).rejects.toThrow();
  });

  it("keeps club stats in sync when the database is edited directly", async () => {
    const { id } = await write(alice, onePiece, "perfection");
    await db.update(reviews).set({ score: 1 }).where(eq(reviews.id, id));

    const [row] = await db.select().from(media).where(eq(media.id, onePiece));
    expect([row?.clubReviewCount, row?.clubScoreSum]).toEqual([1, 1]);
  });

  it("only stores the four verdicts (1-4)", async () => {
    const { id } = await write(alice, onePiece, "perfection");

    await expect(db.update(reviews).set({ score: 5 }).where(eq(reviews.id, id))).rejects.toThrow();
  });
});
