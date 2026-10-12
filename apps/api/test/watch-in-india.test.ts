import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createAnilistClient, toMediaRow } from "../src/lib/anilist.js";
import { createTmdbClient } from "../src/lib/tmdb.js";
import { upsertMedia } from "../src/services/media.js";
import {
  baseTitle,
  findTmdbMatch,
  forgetWatchInIndia,
  watchInIndia,
} from "../src/services/watch-in-india.js";
import { anilistMedia, fakeAnilist } from "./fake-anilist.js";
import { makeApp } from "./helpers.js";
import { type TestDb, createTestDb } from "./test-db.js";

beforeEach(() => {
  forgetWatchInIndia();
});

const ATTACK_ON_TITAN = 1429;
const LIVE_ACTION = 9999;

/**
 * A stand-in for api.themoviedb.org: a few shows, and where they stream. Search matches
 * names loosely, like TMDB's does.
 */
function fakeTmdb({ fail = false } = {}) {
  const shows = [
    {
      id: ATTACK_ON_TITAN,
      name: "Attack on Titan",
      original: "進撃の巨人",
      year: 2013,
      genres: [16],
      popularity: 150,
    },
    // Same name, but live action: never the anime's match.
    {
      id: LIVE_ACTION,
      name: "Attack on Titan",
      original: "Attack on Titan",
      year: 2013,
      genres: [18],
      popularity: 500,
    },
    {
      id: 2000,
      name: "Frieren: Beyond Journey's End",
      original: "葬送のフリーレン",
      year: 2023,
      genres: [16],
      popularity: 90,
    },
  ];
  const providers: Record<number, unknown> = {
    [ATTACK_ON_TITAN]: {
      IN: {
        link: "https://www.themoviedb.org/tv/1429-attack-on-titan/watch?locale=IN",
        flatrate: [
          {
            provider_id: 2100,
            provider_name: "Anime Times Amazon Channel",
            logo_path: "/at.jpg",
            display_priority: 9,
          },
          { provider_id: 8, provider_name: "Netflix", logo_path: "/nf.jpg", display_priority: 1 },
        ],
        ads: [
          {
            provider_id: 192,
            provider_name: "YouTube",
            logo_path: "/yt.jpg",
            display_priority: 20,
          },
        ],
      },
      US: { flatrate: [{ provider_id: 283, provider_name: "Crunchyroll", logo_path: "/cr.jpg" }] },
    },
  };
  const calls: string[] = [];
  const fetch: typeof globalThis.fetch = (input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push(url.pathname + url.search);
    if (fail) return Promise.resolve(new Response("down", { status: 503 }));
    const search = /^\/3\/search\/tv$/.exec(url.pathname);
    if (search) {
      const query = (url.searchParams.get("query") ?? "").toLowerCase();
      const year = url.searchParams.get("first_air_date_year");
      const results = shows
        .filter((s) => s.name.toLowerCase().includes(query) || s.original.includes(query))
        .filter((s) => !year || String(s.year) === year)
        .map((s) => ({
          id: s.id,
          name: s.name,
          original_name: s.original,
          first_air_date: `${String(s.year)}-04-07`,
          genre_ids: s.genres,
          popularity: s.popularity,
        }));
      return Promise.resolve(Response.json({ results }));
    }
    const watch = /^\/3\/tv\/(\d+)\/watch\/providers$/.exec(url.pathname);
    if (watch) {
      const id = Number(watch[1]);
      return Promise.resolve(Response.json({ id, results: providers[id] ?? {} }));
    }
    return Promise.resolve(Response.json({ results: [] }));
  };
  return { client: createTmdbClient({ token: "test-token", fetch }), calls };
}

const titles = (english: string | null, romaji: string, native: string | null, year: number) => ({
  titleEnglish: english,
  titleRomaji: romaji,
  titleNative: native,
  format: "TV",
  seasonYear: year,
  startYear: year,
});

describe("baseTitle", () => {
  it.each([
    ["Attack on Titan Season 3 Part 2", "Attack on Titan"],
    ["Attack on Titan: The Final Season", "Attack on Titan"],
    ["Shingeki no Kyojin 3rd Season", "Shingeki no Kyojin"],
    ["進撃の巨人 Season2", "進撃の巨人"],
    ["Frieren: Beyond Journey's End", "Frieren: Beyond Journey's End"],
  ])("%s -> %s", (title, base) => {
    expect(baseTitle(title)).toBe(base);
  });
});

describe("findTmdbMatch", () => {
  it("finds a later season's show, never a live-action one of the same name", async () => {
    const { client } = fakeTmdb();
    const match = await findTmdbMatch(
      client,
      titles("Attack on Titan Season 3", "Shingeki no Kyojin Season 3", "進撃の巨人 Season3", 2018),
    );
    expect(match).toEqual({ kind: "tv", id: ATTACK_ON_TITAN });
  });

  it("finds nothing rather than guessing", async () => {
    const { client } = fakeTmdb();
    expect(await findTmdbMatch(client, titles("No Such Anime", "Nai", null, 2020))).toBeNull();
  });
});

describe("watchInIndia", () => {
  it("lists what streams it in India, best first, with direct links where AniList has them", async () => {
    const { client } = fakeTmdb();
    const result = await watchInIndia(
      client,
      { ...titles("Attack on Titan", "Shingeki no Kyojin", "進撃の巨人", 2013), anilistId: 16498 },
      [
        {
          site: "Netflix",
          url: "https://www.netflix.com/title/70299043",
          kind: "stream",
          language: null,
          color: null,
          icon: null,
        },
        // Worldwide on AniList, but not in India: never shown.
        {
          site: "Crunchyroll",
          url: "https://www.crunchyroll.com/attack-on-titan",
          kind: "stream",
          language: null,
          color: null,
          icon: null,
        },
      ],
    );

    const more = "https://www.themoviedb.org/tv/1429-attack-on-titan/watch?locale=IN";
    expect(result.matched).toBe(true);
    expect(result.moreUrl).toBe(more);
    expect(result.links.map((l) => [l.site, l.url, l.free])).toEqual([
      ["Netflix", "https://www.netflix.com/title/70299043", false],
      ["Anime Times Amazon Channel", more, false],
      ["YouTube", more, true],
    ]);
    expect(result.links[0]?.logo).toBe("https://image.tmdb.org/t/p/w92/nf.jpg");
  });

  it("points to a JustWatch search when it can't tell", async () => {
    expect(
      await watchInIndia(
        null,
        { ...titles("Some Show", "Some Show", null, 2020), anilistId: 1 },
        [],
      ),
    ).toEqual({
      matched: false,
      links: [],
      moreUrl: "https://www.justwatch.com/in/search?q=Some%20Show",
    });
  });
});

describe("GET /api/media/:id for an anime", () => {
  let db: TestDb;
  let id = 0;

  beforeAll(async () => {
    ({ db } = await createTestDb());
    const [row] = await upsertMedia(db, [
      toMediaRow(
        anilistMedia(16498, {
          title: { romaji: "Shingeki no Kyojin", english: "Attack on Titan", native: "進撃の巨人" },
          seasonYear: 2013,
          startDate: { year: 2013 },
        }),
      ),
    ]);
    id = row?.id ?? 0;
  });

  const detail = async (tmdb: ReturnType<typeof fakeTmdb>["client"]) => {
    const fake = fakeAnilist({ catalog: [anilistMedia(16498)] });
    const { app } = makeApp(db, {
      anilist: createAnilistClient({ fetch: fake.fetch }),
      tmdb,
    });
    const res = await app.request(`/api/media/${String(id)}`);
    expect(res.status).toBe(200);
    return ((await res.json()) as { item: Record<string, unknown> }).item;
  };

  it("shows the official site and where it streams in India, not AniList's worldwide links", async () => {
    const item = await detail(fakeTmdb().client);
    const links = item.links as { site: string; kind: string }[];
    expect(links.map((l) => [l.kind, l.site])).toEqual([
      ["official", "Official Site"],
      ["stream", "Netflix"],
      ["stream", "Anime Times Amazon Channel"],
      ["stream", "YouTube"],
    ]);
    expect(item.watchInIndia).toMatchObject({ matched: true });
  });

  it("still loads when TMDB is down, linking to JustWatch instead", async () => {
    const item = await detail(fakeTmdb({ fail: true }).client);
    expect(item.watchInIndia).toEqual({
      matched: false,
      moreUrl: "https://www.justwatch.com/in/search?q=Attack%20on%20Titan",
    });
    expect((item.links as { kind: string }[]).every((l) => l.kind === "official")).toBe(true);
  });
});
