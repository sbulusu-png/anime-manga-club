import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";

import { listEntries, reviews, users } from "../src/db/schema/index.js";
import { toMediaRow } from "../src/lib/anilist.js";
import { ratingToValue } from "../src/lib/rating.js";
import { upsertMedia } from "../src/services/media.js";
import type { AppEnv } from "../src/types.js";
import { anilistMedia } from "./fake-anilist.js";
import { makeApp } from "./helpers.js";
import { createMember, send } from "./session.js";
import { type TestDb, createTestDb } from "./test-db.js";

let db: TestDb;
let app: Hono<AppEnv>;

interface Profile {
  user: Record<string, unknown>;
  stats: {
    reviews: number;
    likesReceived: number;
    verdicts: Record<string, number>;
    list: Record<"anime" | "manga", Record<string, number>>;
    episodesWatched: number;
    chaptersRead: number;
    topGenres: string[];
  };
}

beforeAll(async () => {
  ({ db } = await createTestDb());
  ({ app } = makeApp(db));
});

describe("member profiles", () => {
  it("shows public details and stats, never the real name or email", async () => {
    const [action, romance, mangaTitle] = await upsertMedia(
      db,
      [
        anilistMedia(1, { genres: ["Action", "Drama"], episodes: 12 }),
        anilistMedia(2, { genres: ["Romance"], episodes: 24 }),
        anilistMedia(3, { type: "MANGA", genres: ["Action"], chapters: 100 }),
      ].map(toMediaRow),
    );
    if (!action || !romance || !mangaTitle) throw new Error("fixtures");
    const fan = await createMember(app, "Fan");
    const liker = await createMember(app, "Liker");

    const [loved] = await db
      .insert(reviews)
      .values([
        { userId: fan.id, mediaId: action.id, score: ratingToValue("perfection"), body: "Great" },
        { userId: fan.id, mediaId: romance.id, score: ratingToValue("skip"), body: "Not for me" },
      ])
      .returning();
    await send(app, "PUT", `/api/reviews/${loved?.id ?? ""}/like`, { cookie: liker.cookie });
    await db.insert(listEntries).values([
      { userId: fan.id, mediaId: action.id, status: "completed", progress: 12 },
      { userId: fan.id, mediaId: romance.id, status: "dropped", progress: 3 },
      { userId: fan.id, mediaId: mangaTitle.id, status: "current", progress: 40 },
    ]);

    const res = await send(app, "GET", "/api/users/FAN");
    expect(res.status).toBe(200);
    const profile = (await res.json()) as Profile;

    expect(Object.keys(profile.user).sort()).toEqual([
      "displayUsername",
      "image",
      "joinedAt",
      "role",
      "username",
    ]);
    expect(profile.user).toMatchObject({ username: "fan", displayUsername: "fan", role: "user" });
    expect(JSON.stringify(profile)).not.toMatch(/@example\.com|"name"/);
    expect(profile.stats).toMatchObject({
      reviews: 2,
      likesReceived: 1,
      verdicts: { skip: 1, timepass: 0, go_for_it: 0, perfection: 1 },
      list: {
        anime: { completed: 1, dropped: 1, current: 0 },
        manga: { current: 1 },
      },
      episodesWatched: 15,
      chaptersRead: 40,
    });
    // Liked (Perfection or completed) titles only; the skipped romance doesn't count.
    expect(profile.stats.topGenres).toEqual(["Action", "Drama"]);
  });

  it("answers 404 for unknown and suspended members", async () => {
    expect((await send(app, "GET", "/api/users/nobody")).status).toBe(404);

    const banned = await createMember(app, "Banned");
    await db.update(users).set({ banned: true }).where(eq(users.id, banned.id));
    expect((await send(app, "GET", "/api/users/banned")).status).toBe(404);
  });
});
