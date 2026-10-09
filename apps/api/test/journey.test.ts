// One member's whole journey through the API, end to end: the real auth, email,
// catalog, review, list and suggestion code, against a migrated Postgres.
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { listEntries, media, reviewLikes, reviews, users } from "../src/db/schema/index.js";
import { createAnilistClient, toMediaRow } from "../src/lib/anilist.js";
import { upsertMedia } from "../src/services/media.js";
import { anilistMedia, fakeAnilist } from "./fake-anilist.js";
import { WEB_ORIGIN, enterSignInCode, linkFromEmail, makeApp, socketFrom } from "./helpers.js";
import { cookiesFrom, createMember, nextIp, send } from "./session.js";
import { type TestDb, createTestDb } from "./test-db.js";

let db: TestDb;

beforeAll(async () => {
  ({ db } = await createTestDb());
  await upsertMedia(
    db,
    [
      anilistMedia(1, {
        title: { romaji: "Sousou no Frieren", english: "Frieren", native: null },
        genres: ["Adventure", "Drama", "Fantasy"],
        episodes: 28,
      }),
      anilistMedia(2, {
        title: { romaji: "Dungeon Meshi", english: "Delicious in Dungeon", native: null },
        genres: ["Adventure", "Comedy", "Fantasy"],
      }),
    ].map(toMediaRow),
  );
});

describe("a member's journey", () => {
  it("signs up, reviews, gets suggestions, resets their password and leaves", async () => {
    const fake = fakeAnilist({
      catalog: [
        anilistMedia(101, {
          title: {
            romaji: "Kusuriya no Hitorigoto",
            english: "The Apothecary Diaries",
            native: null,
          },
          genres: ["Drama", "Mystery"],
          episodes: 24,
        }),
      ],
    });
    const { app } = makeApp(db, { anilist: createAnilistClient({ fetch: fake.fetch }) });
    const call = (method: string, path: string, cookie = "", body?: unknown) =>
      send(app, method, path, { cookie, ...(body !== undefined && { body }) });
    const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;

    // 1. Sign up; nothing is possible until the email is confirmed.
    const signUp = await app.request(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN },
        body: JSON.stringify({
          name: "Maomao",
          email: "maomao@example.com",
          password: "poison-taster-2024",
          username: "Maomao",
        }),
      },
      socketFrom(nextIp()),
    );
    expect(signUp.status).toBe(200);
    expect((await call("GET", "/api/me")).status).toBe(401);

    const confirm = linkFromEmail("maomao@example.com", /Confirm your email/);
    const confirmed = await app.request(
      `${confirm.pathname}${confirm.search}`,
      {},
      socketFrom(nextIp()),
    );
    let cookie = cookiesFrom(confirmed);
    expect(
      await json<{ user: { username: string } }>(call("GET", "/api/me", cookie)),
    ).toMatchObject({
      user: { username: "maomao" },
    });

    // 2. Browse, then import a title the club doesn't have yet.
    const browse = await json<{ items: { title: { display: string } }[] }>(
      call("GET", "/api/media?genre=Fantasy&sort=title"),
    );
    expect(browse.items.map((m) => m.title.display)).toEqual(["Delicious in Dungeon", "Frieren"]);
    const found = await json<{ items: { id: number; title: { display: string } }[] }>(
      call("GET", "/api/media/discover?q=apothecary"),
    );
    const diaries = found.items[0];
    expect(diaries?.title.display).toBe("The Apothecary Diaries");
    const diariesId = diaries?.id ?? 0;

    // 3. Track it, finish it, review it.
    await call("PUT", `/api/list/${diariesId}`, cookie, { status: "current", progress: 3 });
    const done = await json<{ item: { progress: number } }>(
      call("PUT", `/api/list/${diariesId}`, cookie, { status: "completed" }),
    );
    expect(done.item.progress).toBe(24);
    const written = await call("POST", "/api/reviews", cookie, {
      mediaId: diariesId,
      rating: "perfection",
      body: "A sharp, funny mystery with a heroine who notices everything.",
    });
    expect(written.status).toBe(201);
    const { item: review } = await json<{ item: { id: string } }>(written);

    // 4. Another member likes it; the club verdict and feed update.
    const jinshi = await createMember(app, "Jinshi");
    await call("PUT", `/api/reviews/${review.id}/like`, jinshi.cookie);
    const detail = await json<{ item: { club: Record<string, unknown> } }>(
      call("GET", `/api/media/${diariesId}`),
    );
    expect(detail.item.club).toMatchObject({ verdict: "perfection", reviewCount: 1 });
    const top = await json<{ items: { id: string; likeCount: number }[] }>(
      call("GET", "/api/reviews?sort=top"),
    );
    expect(top.items[0]).toMatchObject({ id: review.id, likeCount: 1 });

    // 5. Suggestions reflect their taste and explain why.
    const recs = await json<{ items: { reasons: string[] }[]; basedOn: { reviews: number } }>(
      call("GET", "/api/recommendations", cookie),
    );
    expect(recs.basedOn.reviews).toBe(1);
    expect(recs.items.length).toBeGreaterThan(0);
    expect(recs.items.every((r) => r.reasons.length > 0)).toBe(true);

    // 6. Forgotten password: reset from the email, then sign in with the new one.
    await call("POST", "/api/auth/request-password-reset", "", {
      email: "maomao@example.com",
      redirectTo: `${WEB_ORIGIN}/reset-password`,
    });
    const resetLink = linkFromEmail("maomao@example.com", /Reset your/);
    const resetPage = new URL(
      (await app.request(`${resetLink.pathname}${resetLink.search}`)).headers.get("location") ?? "",
    );
    const reset = await call("POST", "/api/auth/reset-password", "", {
      token: resetPage.searchParams.get("token"),
      newPassword: "new-antidote-recipe-7",
    });
    expect(reset.status).toBe(200);
    expect((await call("GET", "/api/me", cookie)).status).toBe(401);
    const signIn = await call("POST", "/api/auth/sign-in/email", "", {
      email: "maomao@example.com",
      password: "new-antidote-recipe-7",
    });
    cookie = cookiesFrom(signIn);
    // Every sign-in needs the code from the email.
    expect((await call("GET", "/api/me", cookie)).status).toBe(401);
    expect((await enterSignInCode(app, cookie, "maomao@example.com")).status).toBe(200);
    expect((await call("GET", "/api/me", cookie)).status).toBe(200);

    // 7. Leave the club: everything they made goes, and the counts stay right.
    const [me] = await db.select().from(users).where(eq(users.email, "maomao@example.com"));
    const leave = await call("POST", "/api/auth/delete-user", cookie, {
      password: "new-antidote-recipe-7",
    });
    expect(leave.status).toBe(200);

    const userId = me?.id ?? "";
    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(0);
    expect(await db.select().from(reviews).where(eq(reviews.userId, userId))).toHaveLength(0);
    expect(await db.select().from(listEntries).where(eq(listEntries.userId, userId))).toHaveLength(
      0,
    );
    expect(
      await db.select().from(reviewLikes).where(eq(reviewLikes.reviewId, review.id)),
    ).toHaveLength(0);
    const [title] = await db.select().from(media).where(eq(media.id, diariesId));
    expect([title?.clubReviewCount, title?.clubScoreSum]).toEqual([0, 0]);
    // Many steps end to end (including password hashing twice), so allow more than
    // the 5-second default on a busy machine.
  }, 30_000);
});
