import type { Hono } from "hono";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { listEntries, media } from "../src/db/schema/index.js";
import { type AnilistListEntry, createAnilistClient } from "../src/lib/anilist.js";
import type { ErrorBody } from "../src/lib/errors.js";
import type { AppEnv } from "../src/types.js";
import { anilistMedia, fakeAnilist } from "./fake-anilist.js";
import { makeApp } from "./helpers.js";
import { createMember, send } from "./session.js";
import { type TestDb, createTestDb } from "./test-db.js";

type Member = Awaited<ReturnType<typeof createMember>>;

const entry = (
  id: number,
  status: AnilistListEntry["status"],
  score: number,
  overrides: Parameters<typeof anilistMedia>[1] = {},
): AnilistListEntry => ({
  status,
  progress: status === "COMPLETED" ? 12 : 3,
  score,
  media: anilistMedia(id, {
    title: { romaji: `Imported ${String(id)}`, english: null, native: null },
    ...overrides,
  }),
});

const LISTS = {
  fanOfAction: [
    entry(501, "COMPLETED", 92),
    entry(502, "CURRENT", 0), // no score given
    entry(503, "DROPPED", 30),
    entry(504, "PLANNING", 0), // no "plan to watch" here: skipped
    entry(505, "PAUSED", 70, { isAdult: true }), // adult titles stay out
    entry(506, "COMPLETED", 85, { type: "MANGA", chapters: 100, episodes: null }),
  ],
};

let db: TestDb;
let app: Hono<AppEnv>;
let alice: Member, noName: Member;

beforeAll(async () => {
  ({ db } = await createTestDb());
  ({ app } = makeApp(db));
  alice = await createMember(app, "Alice");
  noName = await createMember(app, "NoName", { username: null });
});

beforeEach(async () => {
  await db.delete(listEntries);
  // A fresh app per test: its own rate-limit window and a fake AniList with the lists.
  ({ app } = makeApp(db, {
    anilist: createAnilistClient({ fetch: fakeAnilist({ lists: LISTS }).fetch }),
  }));
});

const importList = (member: Member | null, username: string) =>
  send(app, "POST", "/api/list/import", {
    ...(member && { cookie: member.cookie }),
    body: { source: "anilist", username },
  });

describe("importing an AniList list", () => {
  it("brings in statuses, progress and scores, skipping planning and adult titles", async () => {
    const res = await importList(alice, "fanOfAction");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      imported: { anime: 3, manga: 1 },
      skipped: { planning: 1, adult: 1 },
    });

    const rows = await db
      .select({
        anilistId: media.anilistId,
        status: listEntries.status,
        progress: listEntries.progress,
        score: listEntries.score,
      })
      .from(listEntries)
      .innerJoin(media, eq(media.id, listEntries.mediaId))
      .where(eq(listEntries.userId, alice.id))
      .orderBy(media.anilistId);
    expect(rows).toEqual([
      { anilistId: 501, status: "completed", progress: 12, score: 92 },
      { anilistId: 502, status: "current", progress: 3, score: null },
      { anilistId: 503, status: "dropped", progress: 3, score: 30 },
      { anilistId: 506, status: "completed", progress: 12, score: 85 },
    ]);
    // Kept titles joined the catalog; adult ones are never stored.
    expect(await db.select().from(media).where(eq(media.anilistId, 506))).toHaveLength(1);
    expect(await db.select().from(media).where(eq(media.anilistId, 505))).toHaveLength(0);
  });

  it("keeps imported scores private", async () => {
    await importList(alice, "fanOfAction");
    const res = await send(app, "GET", "/api/list?user=alice");
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).not.toMatch(/"score"/);
  });

  it("updates entries when importing again, without duplicating them", async () => {
    await importList(alice, "fanOfAction");
    const [first] = await db.select().from(listEntries).where(eq(listEntries.userId, alice.id));
    if (!first) throw new Error("expected an entry");
    await db
      .update(listEntries)
      .set({ status: "paused" })
      .where(eq(listEntries.mediaId, first.mediaId));

    expect((await importList(alice, "fanOfAction")).status).toBe(200);
    const rows = await db.select().from(listEntries).where(eq(listEntries.userId, alice.id));
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.mediaId === first.mediaId)?.status).toBe(first.status);
  });

  it("says so when the AniList user doesn't exist or their list is private", async () => {
    const res = await importList(alice, "nobodyHere");
    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorBody).error.code).toBe("ANILIST_USER_NOT_FOUND");
  });

  it("checks the username and needs a signed-in member with a username", async () => {
    expect((await importList(alice, "not a name!")).status).toBe(400);
    expect((await importList(null, "fanOfAction")).status).toBe(401);
    expect((await importList(noName, "fanOfAction")).status).toBe(403);
  });

  it("allows only a few imports every 10 minutes", async () => {
    for (let i = 0; i < 3; i++) expect((await importList(alice, "fanOfAction")).status).toBe(200);
    expect((await importList(alice, "fanOfAction")).status).toBe(429);
  });
});
