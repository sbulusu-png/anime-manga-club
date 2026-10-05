import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { media } from "../src/db/schema/index.js";
import { createAnilistClient, toMediaRow } from "../src/lib/anilist.js";
import type { ErrorBody } from "../src/lib/errors.js";
import { upsertMedia } from "../src/services/media.js";
import { anilistMedia, fakeAnilist } from "./fake-anilist.js";
import { makeApp, socketFrom } from "./helpers.js";
import { type TestDb, createTestDb } from "./test-db.js";

let db: TestDb;

interface Summary {
  id: number;
  anilistId: number;
  type: string;
  title: { display: string; romaji: string; english: string | null };
  genres: string[];
  year: number | null;
  anilistScore: number | null;
  popularity: number | null;
}
interface ListBody {
  items: Summary[];
  nextCursor: string | null;
}

// A small local catalog with known values for every filter and sort.
const LOCAL = [
  anilistMedia(1, {
    title: { romaji: "Wan Pisu", english: "One Piece", native: "ワンピース" },
    genres: ["Action", "Adventure", "Comedy"],
    tags: [{ name: "Pirates", rank: 90, isMediaSpoiler: false, isAdult: false }],
    popularity: 900,
    averageScore: 88,
    seasonYear: 1999,
    startDate: { year: 1999 },
    status: "RELEASING",
  }),
  anilistMedia(2, {
    title: { romaji: "Bleach", english: "Bleach", native: null },
    genres: ["Action", "Supernatural"],
    popularity: 800,
    averageScore: 79,
    season: "FALL",
    seasonYear: 2004,
  }),
  anilistMedia(3, {
    title: { romaji: "Hagane no Renkinjutsushi", english: "Fullmetal Alchemist", native: null },
    synonyms: ["FMA", "Full Metal Alchemist"],
    genres: ["Action", "Adventure", "Drama"],
    popularity: 800, // tie with Bleach: id breaks it
    averageScore: null, // unscored titles sort last
    season: "SPRING",
    seasonYear: 2009,
  }),
  anilistMedia(4, {
    type: "MANGA",
    format: "MANGA",
    title: { romaji: "Black Clover", english: null, native: null },
    genres: ["Action", "Comedy", "Fantasy"],
    popularity: 500,
    averageScore: 75,
    season: null,
    seasonYear: null,
    startDate: { year: 2015 },
    chapters: 370,
  }),
  anilistMedia(5, {
    title: { romaji: "Meitantei Conan", english: "Case Closed", native: "名探偵コナン" },
    synonyms: ["Detective Conan"],
    genres: ["Mystery", "Comedy"],
    popularity: 300,
    averageScore: 82,
    format: "TV",
    seasonYear: 1996,
  }),
  anilistMedia(6, {
    title: { romaji: "100% Pascal-sensei", english: null, native: null },
    genres: ["Comedy"],
    popularity: 10,
    averageScore: 60,
  }),
  anilistMedia(7, {
    title: { romaji: "Hidden Adult Title", english: null, native: null },
    isAdult: true,
    popularity: 99_999,
  }),
];

let localIds: Map<number, number>; // AniList id -> our id

beforeAll(async () => {
  ({ db } = await createTestDb());
  const rows = await upsertMedia(db, LOCAL.map(toMediaRow));
  localIds = new Map(rows.map((row) => [row.anilistId, row.id]));
});

function list(query = "") {
  return makeApp(db).app.request(`/api/media${query}`);
}
async function listBody(query = ""): Promise<ListBody> {
  const res = await list(query);
  expect(res.status).toBe(200);
  return (await res.json()) as ListBody;
}
const titles = (body: ListBody) => body.items.map((item) => item.title.display);

describe("GET /api/media", () => {
  it("lists the most popular titles first and hides adult titles", async () => {
    expect(titles(await listBody())).toEqual([
      "One Piece",
      "Fullmetal Alchemist", // ties with Bleach on popularity; the newer id comes first
      "Bleach",
      "Black Clover",
      "Case Closed",
      "100% Pascal-sensei",
    ]);
  });

  it("pages through everything with cursors, without gaps or repeats", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const body = await listBody(`?limit=2${cursor ? `&cursor=${cursor}` : ""}`);
      seen.push(...titles(body));
      cursor = body.nextCursor;
      pages++;
    } while (cursor && pages < 10);

    expect(pages).toBe(3);
    expect(seen).toEqual(titles(await listBody()));
  });

  it.each([
    [
      "score",
      [
        "One Piece",
        "Case Closed",
        "Bleach",
        "Black Clover",
        "100% Pascal-sensei",
        "Fullmetal Alchemist",
      ],
    ],
    [
      "title",
      [
        "100% Pascal-sensei",
        "Black Clover",
        "Bleach",
        "Case Closed",
        "Fullmetal Alchemist",
        "One Piece",
      ],
    ],
  ])("sorts by %s", async (sort, expected) => {
    expect(titles(await listBody(`?sort=${sort}`))).toEqual(expected);
  });

  it("pages correctly when sorting by title", async () => {
    const first = await listBody("?sort=title&limit=4");
    const second = await listBody(`?sort=title&limit=4&cursor=${first.nextCursor ?? ""}`);

    expect([...titles(first), ...titles(second)]).toEqual(titles(await listBody("?sort=title")));
    expect(second.nextCursor).toBeNull();
  });

  it("sorts by newest using the season year, or the start year for manga", async () => {
    expect(titles(await listBody("?sort=newest"))).toEqual([
      "100% Pascal-sensei", // 2020
      "Black Clover", // 2015 (manga: start year)
      "Fullmetal Alchemist", // 2009
      "Bleach", // 2004
      "One Piece", // 1999
      "Case Closed", // 1996
    ]);
  });

  it.each([
    ["type", "?type=manga", ["Black Clover"]],
    ["one genre", "?genre=Mystery", ["Case Closed"]],
    [
      "all of several genres",
      "?genre=Action&genre=Adventure",
      ["One Piece", "Fullmetal Alchemist"],
    ],
    ["tag", "?tag=Pirates", ["One Piece"]],
    ["season", "?season=SPRING", ["Fullmetal Alchemist"]],
    ["year", "?year=2004", ["Bleach"]],
    ["manga start year", "?year=2015", ["Black Clover"]],
    ["format, any case", "?format=manga", ["Black Clover"]],
    ["status", "?status=releasing", ["One Piece"]],
  ])("filters by %s", async (_name, query, expected) => {
    expect(titles(await listBody(query))).toEqual(expected);
  });

  it.each([
    ["an English title", "piece", ["One Piece"]],
    ["a romaji title, ignoring case", "MEITANTEI", ["Case Closed"]],
    ["a native title", "コナン", ["Case Closed"]],
    ["a literal % sign", "100%", ["100% Pascal-sensei"]],
    ["a Japanese title with a word left out", "hagane renkinjutsushi", ["Fullmetal Alchemist"]],
    ["a Japanese title with a macron", "Wan Pīsu", ["One Piece"]],
    ["a long vowel spelled out", "wan piisu", ["One Piece"]],
    ["words in any order", "conan meitantei", ["Case Closed"]],
    ["an alternative name", "detective conan", ["Case Closed"]],
    ["an abbreviation", "fma", ["Fullmetal Alchemist"]],
    ["a small typo", "hagane no renkinjutsusi", ["Fullmetal Alchemist"]],
    ["nothing", "zzz-no-match", []],
  ])("searches %s", async (_name, q, expected) => {
    expect(titles(await listBody(`?q=${encodeURIComponent(q)}`))).toEqual(expected);
  });

  it.each([
    ["an unknown sort", "?sort=random"],
    ["a limit over 50", "?limit=51"],
    ["an unknown type", "?type=novel"],
    ["a bad season", "?season=MONSOON"],
    ["a format with symbols", "?format=TV;drop"],
  ])("rejects %s with a validation error", async (_name, query) => {
    const res = await list(query);

    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorBody).error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects tampered cursors and cursors from another sort order", async () => {
    const { nextCursor } = await listBody("?limit=1");

    for (const query of ["?cursor=not-a-cursor", `?sort=title&cursor=${nextCursor ?? ""}`]) {
      const res = await list(query);
      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorBody).error.code).toBe("INVALID_CURSOR");
    }
  });
});

describe("GET /api/media/genres", () => {
  it("lists every genre once, alphabetically, ignoring adult titles", async () => {
    const res = await makeApp(db).app.request("/api/media/genres");

    expect(await res.json()).toEqual({
      genres: ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Mystery", "Supernatural"],
    });
  });
});

describe("GET /api/media/:id", () => {
  it("returns the full title with characters", async () => {
    const fake = fakeAnilist({ catalog: LOCAL });
    const { app } = makeApp(db, { anilist: createAnilistClient({ fetch: fake.fetch }) });

    const res = await app.request(`/api/media/${localIds.get(5) ?? 0}`);

    expect(res.status).toBe(200);
    const { item } = (await res.json()) as { item: Record<string, unknown> };
    expect(item).toMatchObject({
      title: { display: "Case Closed", native: "名探偵コナン" },
      synopsis: "Synopsis for 5.",
      anilistUrl: "https://anilist.co/anime/5",
      characters: [{ name: "Hero of 5", role: "MAIN" }],
    });
  });

  it("still loads when AniList can't provide characters", async () => {
    const fake = fakeAnilist({ offline: true });
    const { app } = makeApp(db, { anilist: createAnilistClient({ fetch: fake.fetch }) });

    const res = await app.request(`/api/media/${localIds.get(6) ?? 0}`);

    expect(res.status).toBe(200);
    expect(((await res.json()) as { item: { characters: unknown[] } }).item.characters).toEqual([]);
  });

  it.each([
    ["unknown ids", "999999", 404],
    ["adult titles", "adult", 404],
    ["non-numeric ids", "abc", 400],
  ])("refuses %s", async (_name, idText, status) => {
    const id = idText === "adult" ? String(localIds.get(7)) : idText;
    const res = await makeApp(db).app.request(`/api/media/${id}`);

    expect(res.status).toBe(status);
  });

  it("refreshes a stale title from AniList in the background", async () => {
    const id = localIds.get(2) ?? 0;
    await db
      .update(media)
      .set({ syncedAt: sql`now() - interval '8 days'` })
      .where(eq(media.id, id));
    const fresh = anilistMedia(2, {
      title: { romaji: "Bleach", english: "Bleach: Thousand-Year Blood War", native: null },
      genres: ["Action", "Supernatural"],
      popularity: 800,
    });
    const fake = fakeAnilist({ catalog: [fresh] });
    const { app } = makeApp(db, { anilist: createAnilistClient({ fetch: fake.fetch }) });

    const res = await app.request(`/api/media/${id}`);
    const { item } = (await res.json()) as { item: Summary };
    expect(item.title.display).toBe("Bleach"); // served immediately from our copy

    await expect
      .poll(async () => (await db.select().from(media).where(eq(media.id, id)))[0]?.titleEnglish)
      .toBe("Bleach: Thousand-Year Blood War");
    expect(fake.count("byId")).toBe(1);
  });
});

describe("GET /api/media/discover", () => {
  it("imports matching titles from AniList in relevance order, skipping adult ones", async () => {
    const fake = fakeAnilist({
      catalog: [
        anilistMedia(101, { title: { romaji: "Spy x Family", english: null, native: null } }),
        anilistMedia(102, { title: { romaji: "Spy Classroom", english: null, native: null } }),
        anilistMedia(103, {
          title: { romaji: "Spy Adult", english: null, native: null },
          isAdult: true,
        }),
      ],
    });
    const { app } = makeApp(db, { anilist: createAnilistClient({ fetch: fake.fetch }) });
    const discover = () => app.request("/api/media/discover?q=spy", {}, socketFrom("203.0.113.10"));

    const body = (await (await discover()).json()) as ListBody;
    expect(body.items.map((i) => i.title.display)).toEqual(["Spy x Family", "Spy Classroom"]);
    expect(body.items.every((i) => i.id > 0)).toBe(true); // stored with our own ids

    // Imported titles now show up in normal search, and a repeat search is cached.
    expect(titles(await listBody("?q=spy&sort=title"))).toEqual(["Spy Classroom", "Spy x Family"]);
    await discover();
    expect(fake.count("search")).toBe(1);
  });

  it("limits each visitor to 10 AniList lookups a minute", async () => {
    const { app } = makeApp(db);
    const statuses = [];
    for (let i = 0; i < 11; i++) {
      const res = await app.request(
        `/api/media/discover?q=limit${i}`,
        {},
        socketFrom("203.0.113.20"),
      );
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    const other = await app.request("/api/media/discover?q=other", {}, socketFrom("203.0.113.21"));
    expect(other.status).toBe(200);
  });

  it("requires at least 2 characters", async () => {
    const res = await makeApp(db).app.request("/api/media/discover?q=a");

    expect(res.status).toBe(400);
  });

  it.each([
    ["busy (429)", { failWith: 429 }, 503, "CATALOG_BUSY"],
    ["erroring (500)", { failWith: 500 }, 502, "CATALOG_UNAVAILABLE"],
    ["unreachable", { offline: true }, 502, "CATALOG_UNAVAILABLE"],
  ] as const)("reports AniList being %s", async (_name, options, status, code) => {
    const fake = fakeAnilist(options);
    const { app } = makeApp(db, { anilist: createAnilistClient({ fetch: fake.fetch }) });

    const res = await app.request(`/api/media/discover?q=${code}`, {}, socketFrom("203.0.113.30"));

    expect(res.status).toBe(status);
    expect(((await res.json()) as ErrorBody).error.code).toBe(code);
  });
});

describe("GET /api/media/anilist/:id", () => {
  it("returns titles we already have without calling AniList", async () => {
    const fake = fakeAnilist();
    const { app } = makeApp(db, { anilist: createAnilistClient({ fetch: fake.fetch }) });

    const res = await app.request("/api/media/anilist/1", {}, socketFrom("203.0.113.40"));

    expect(await res.json()).toMatchObject({ id: localIds.get(1) });
    expect(fake.calls).toHaveLength(0);
  });

  it("imports a title the first time it's requested", async () => {
    const fake = fakeAnilist({
      catalog: [
        anilistMedia(235, {
          title: { romaji: "Meitantei Conan", english: "Detective Conan", native: null },
        }),
      ],
    });
    const { app } = makeApp(db, { anilist: createAnilistClient({ fetch: fake.fetch }) });

    const res = await app.request("/api/media/anilist/235", {}, socketFrom("203.0.113.41"));

    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: number };
    const detail = await app.request(`/api/media/${id}`);
    expect(await detail.json()).toMatchObject({ item: { title: { display: "Detective Conan" } } });
  });

  it.each([
    ["ids AniList doesn't know", 424242, []],
    ["adult titles", 666, [anilistMedia(666, { isAdult: true })]],
  ])("answers 404 for %s", async (_name, id, catalog) => {
    const fake = fakeAnilist({ catalog });
    const { app } = makeApp(db, { anilist: createAnilistClient({ fetch: fake.fetch }) });

    const res = await app.request(`/api/media/anilist/${id}`, {}, socketFrom("203.0.113.42"));

    expect(res.status).toBe(404);
  });
});

describe("AniList client", () => {
  it("stops calling AniList once the shared per-minute budget is spent", async () => {
    const fake = fakeAnilist();
    const anilist = createAnilistClient({ fetch: fake.fetch, maxRequestsPerMinute: 2 });

    await anilist.search("a");
    await anilist.search("b");
    await expect(anilist.search("c")).rejects.toMatchObject({ code: "CATALOG_BUSY" });
    expect(fake.calls).toHaveLength(2);
  });

  it("rejects responses that don't match AniList's schema", async () => {
    const broken: typeof fetch = () =>
      Promise.resolve(new Response(JSON.stringify({ data: { Page: { media: [{ id: "x" }] } } })));

    await expect(createAnilistClient({ fetch: broken }).search("x")).rejects.toMatchObject({
      status: 502,
      code: "CATALOG_UNAVAILABLE",
    });
  });
});
