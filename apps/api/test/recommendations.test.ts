import type { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { listEntries, reviews } from "../src/db/schema/index.js";
import { type AnilistMedia, toMediaRow } from "../src/lib/anilist.js";
import { type Rating, ratingToValue } from "../src/lib/rating.js";
import { upsertMedia } from "../src/services/media.js";
import { franchiseKey, signalWeight, tagSimilarity } from "../src/services/recommendations.js";
import type { AppEnv } from "../src/types.js";
import { anilistMedia } from "./fake-anilist.js";
import { makeApp } from "./helpers.js";
import { createMember, send } from "./session.js";
import { type TestDb, createTestDb } from "./test-db.js";

interface Rec {
  media: { id: number; title: { display: string } };
  reasons: string[];
}
type Member = Awaited<ReturnType<typeof createMember>>;

let db: TestDb;
let app: Hono<AppEnv>;
let alice: Member, bob: Member, carol: Member;
const ids = new Map<string, number>();

const title = (name: string, genres: string[], overrides: Partial<AnilistMedia> = {}) => ({
  name,
  genres,
  overrides,
});
const CATALOG = [
  title("Blade Quest", ["Action", "Adventure"], { popularity: 900 }),
  title("Sword Saga", ["Action", "Fantasy"], { popularity: 800 }),
  title("Fist Legend", ["Action"], { popularity: 700 }),
  title("Love Letters", ["Romance", "Drama"], { popularity: 950 }),
  title("Heart Beats", ["Romance"], { popularity: 850 }),
  title("Quiet Farm", ["Slice of Life"], { popularity: 100, averageScore: 70 }),
  title("Mecha Storm", ["Mecha", "Action"], { popularity: 600 }),
  title("Mecha Storm Season 2", ["Mecha", "Action"], { popularity: 590 }),
  title("Mecha Storm: The Final Season", ["Mecha", "Action"], { popularity: 580 }),
  title("Hidden Gem", ["Mystery"], { popularity: 50 }),
  // Adaptations share the English title on AniList; the romaji keeps our fixtures unique.
  title("Blade Quest (Manga)", ["Action", "Adventure"], {
    type: "MANGA",
    title: { romaji: "Blade Quest (Manga)", english: "Blade Quest", native: null },
    popularity: 400,
  }),
  title("Forbidden", ["Action"], { isAdult: true, popularity: 99_999 }),
];

beforeAll(async () => {
  ({ db } = await createTestDb());
  ({ app } = makeApp(db));
  const rows = await upsertMedia(
    db,
    CATALOG.map(({ name, genres, overrides }, i) =>
      toMediaRow(
        anilistMedia(i + 1, {
          title: { romaji: name, english: null, native: null },
          genres,
          ...overrides,
        }),
      ),
    ),
  );
  for (const row of rows) ids.set(row.titleRomaji, row.id);
  alice = await createMember(app, "Alice");
  bob = await createMember(app, "Bob");
  carol = await createMember(app, "Carol");
});

beforeEach(async () => {
  await db.delete(reviews);
  await db.delete(listEntries);
});

const id = (name: string) => ids.get(name) ?? 0;
async function review(member: Member, name: string, rating: Rating) {
  await db.insert(reviews).values({
    userId: member.id,
    mediaId: id(name),
    score: ratingToValue(rating),
    body: "Test review body",
  });
}
async function recommend(member: Member, query = "") {
  const res = await send(app, "GET", `/api/recommendations${query}`, { cookie: member.cookie });
  expect(res.status).toBe(200);
  return (await res.json()) as { items: Rec[]; basedOn: { reviews: number; listEntries: number } };
}
const names = (items: Rec[]) => items.map((r) => r.media.title.display);

describe("recommendations for you", () => {
  it("starts new members with popular, highly rated titles", async () => {
    const { items, basedOn } = await recommend(alice);

    expect(basedOn).toEqual({ reviews: 0, listEntries: 0 });
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]?.reasons).toEqual(["Popular and highly rated"]);
    expect(names(items)).not.toContain("Forbidden");
  });

  it("learns genre taste from verdicts", async () => {
    await review(alice, "Blade Quest", "perfection");
    await review(alice, "Love Letters", "skip");

    const { items } = await recommend(alice);
    const ranked = names(items);
    expect(ranked).toContain("Sword Saga");
    expect(ranked).not.toContain("Heart Beats"); // pure romance, which Alice skipped
    expect(items.find((r) => r.media.title.display === "Sword Saga")?.reasons).toContain(
      "Because you enjoy Action",
    );
  });

  it("surfaces club favourites outside the member's usual taste", async () => {
    await review(alice, "Blade Quest", "perfection");
    // Two other members rate a quiet slice-of-life show highly; nothing links it to Alice.
    await review(bob, "Quiet Farm", "perfection");
    await review(carol, "Quiet Farm", "go_for_it");

    const { items } = await recommend(alice);
    const farm = items.find((r) => r.media.title.display === "Quiet Farm");
    expect(farm?.reasons).toContain("Club favourite: the club says Perfection");
  });

  it("never recommends titles already reviewed or on the list", async () => {
    await review(alice, "Blade Quest", "perfection");
    await db.insert(listEntries).values([
      { userId: alice.id, mediaId: id("Sword Saga"), status: "dropped" },
      { userId: alice.id, mediaId: id("Fist Legend"), status: "planning" },
    ]);

    const ranked = (await recommend(alice)).items.map((r) => r.media.id);
    for (const seen of ["Blade Quest", "Sword Saga", "Fist Legend"]) {
      expect(ranked).not.toContain(id(seen));
    }
  });

  it("recommends what members with similar taste loved", async () => {
    await review(alice, "Blade Quest", "perfection");
    await review(bob, "Blade Quest", "perfection");
    await review(bob, "Hidden Gem", "perfection"); // obscure and outside Alice's genres

    const { items } = await recommend(alice);
    const gem = items.find((r) => r.media.title.display === "Hidden Gem");
    expect(gem?.reasons).toContain("A member with similar taste loved this");
    expect(names(items).indexOf("Hidden Gem")).toBeLessThan(3);
  });

  it("shows at most one title per franchise", async () => {
    await review(alice, "Fist Legend", "perfection");

    const ranked = names((await recommend(alice, "?limit=50")).items);
    expect(ranked.filter((n) => n.startsWith("Mecha Storm"))).toHaveLength(1);
  });

  it("says when a title continues or adapts a series the member loved", async () => {
    await review(alice, "Mecha Storm", "perfection");

    const { items } = await recommend(alice, "?limit=50");
    const sequel = items.find((r) => r.media.title.display.startsWith("Mecha Storm"));
    expect(sequel?.reasons[0]).toBe("More Mecha Storm, which you loved");
    expect(names(items).indexOf(sequel?.media.title.display ?? "")).toBe(0);

    await review(bob, "Blade Quest", "perfection");
    const forBob = await recommend(bob, "?type=manga");
    expect(forBob.items[0]?.reasons[0]).toBe("The manga of Blade Quest, which you loved");
  });

  it("filters by type and reports what it was based on", async () => {
    await review(alice, "Blade Quest", "perfection");
    await db
      .insert(listEntries)
      .values({ userId: alice.id, mediaId: id("Quiet Farm"), status: "completed" });

    const { items, basedOn } = await recommend(alice, "?type=manga");
    expect(items.map((r) => r.media.id)).toEqual([id("Blade Quest (Manga)")]);
    expect(basedOn).toEqual({ reviews: 1, listEntries: 1 });
  });

  it("requires signing in", async () => {
    expect((await send(app, "GET", "/api/recommendations")).status).toBe(401);
  });
});

describe("similar titles", () => {
  async function similar(name: string) {
    const res = await send(app, "GET", `/api/media/${id(name)}/similar`);
    expect(res.status).toBe(200);
    return ((await res.json()) as { items: Rec[] }).items;
  }

  it("puts titles co-loved by members first", async () => {
    await review(alice, "Blade Quest", "perfection");
    await review(alice, "Quiet Farm", "perfection");
    await review(bob, "Blade Quest", "go_for_it");
    await review(bob, "Quiet Farm", "perfection");
    await review(carol, "Blade Quest", "perfection");

    const items = await similar("Blade Quest");
    expect(items[0]?.media.title.display).toBe("Quiet Farm");
    expect(items[0]?.reasons).toEqual(["2 members who loved Blade Quest also loved this"]);
  });

  it("falls back to shared genres, same type, other franchises only", async () => {
    const items = await similar("Mecha Storm");
    const ranked = names(items);

    expect(ranked).not.toContain("Mecha Storm Season 2");
    expect(items.map((r) => r.media.id)).not.toContain(id("Blade Quest (Manga)"));
    expect(ranked).not.toContain("Forbidden");
    expect(items[0]?.reasons[0]).toMatch(/^Also Action/);
  });

  it("answers 404 for unknown titles", async () => {
    expect((await send(app, "GET", "/api/media/999999/similar")).status).toBe(404);
  });
});

describe("tagSimilarity", () => {
  const target = ["Military", "Revenge", "Survival", "Primarily Teen Cast"];

  it("counts a title's most relevant tags for more", () => {
    const sharesTopTags = tagSimilarity(["Military", "Revenge"], target);
    const sharesMinorTags = tagSimilarity(["Survival", "Primarily Teen Cast"], target);
    expect(sharesTopTags).toBeGreaterThan(sharesMinorTags);
  });

  it("is 1 for identical themes and 0 for none", () => {
    expect(tagSimilarity(target, target)).toBe(1);
    expect(tagSimilarity(["Idols"], target)).toBe(0);
    expect(tagSimilarity(["Idols"], [])).toBe(0);
  });
});

describe("franchiseKey", () => {
  const key = (english: string) => franchiseKey({ titleEnglish: english, titleRomaji: "" });

  it.each([
    "Attack on Titan Season 2",
    "Attack on Titan Season 3 Part 2",
    "Attack on Titan: The Final Season",
    "Attack on Titan Final Season",
    "Attack on Titan 2nd Season",
    "Attack on Titan II",
  ])("groups %s with Attack on Titan", (name) => {
    expect(key(name)).toBe(key("Attack on Titan"));
  });

  it.each([
    ["Demon Slayer -Kimetsu no Yaiba- The Movie: Mugen Train", "Demon Slayer: Kimetsu no Yaiba"],
    ["Naruto - Shippuden", "Naruto"],
    ["Fullmetal Alchemist: Brotherhood", "Fullmetal Alchemist"],
  ])("groups %s with %s", (a, b) => {
    expect(key(a)).toBe(key(b));
  });

  it("keeps different series apart, even when one name contains the other's words", () => {
    expect(key("Bleach")).not.toBe(key("Black Clover"));
    expect(key("Spy x Family")).not.toBe(key("Spy Classroom"));
    expect(key("Moviestar Academy")).toBe("moviestar academy"); // "movie" only as a word
    expect(key("Hawaii Five")).toBe("hawaii five"); // "ii" only as a word
  });
});

describe("signalWeight", () => {
  it("maps verdicts to -1..1 and list statuses to softer signals", () => {
    const weight = (rating: Rating) => signalWeight(ratingToValue(rating), null);
    expect(weight("perfection")).toBe(1);
    expect(weight("skip")).toBe(-1);
    expect(weight("go_for_it")).toBeGreaterThan(weight("timepass"));
    expect(weight("timepass")).toBeLessThan(0); // "only timepass" isn't a recommendation
    expect(signalWeight(null, "completed")).toBeGreaterThan(signalWeight(null, "planning"));
    expect(signalWeight(null, "dropped")).toBeLessThan(0);
    // A verdict beats list status: "Skip" on a completed title is still a dislike.
    expect(signalWeight(ratingToValue("skip"), "completed")).toBeLessThan(0);
  });
});
