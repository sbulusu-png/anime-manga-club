import type { AnilistListEntry, AnilistMedia } from "../src/lib/anilist.js";

/** Builds an AniList media record; override only what a test cares about. */
export function anilistMedia(id: number, overrides: Partial<AnilistMedia> = {}): AnilistMedia {
  return {
    id,
    idMal: id,
    type: "ANIME",
    format: "TV",
    status: "FINISHED",
    title: { romaji: `Title ${id}`, english: null, native: null },
    description: `Synopsis for ${id}.`,
    coverImage: { extraLarge: `https://img.example/${id}.jpg`, color: "#123456" },
    bannerImage: null,
    genres: ["Action"],
    tags: [],
    season: "FALL",
    seasonYear: 2020,
    startDate: { year: 2020 },
    episodes: 12,
    chapters: null,
    volumes: null,
    averageScore: 70,
    popularity: 1000,
    isAdult: false,
    ...overrides,
  };
}

interface FakeOptions {
  /** Titles AniList "knows about" (for search, by-id and characters). */
  catalog?: AnilistMedia[];
  /** Forces every response to this status, e.g. 429 or 500. */
  failWith?: number;
  /** Simulates the network being down. */
  offline?: boolean;
  /** Members' lists by AniList username (missing = no such user, or private). */
  lists?: Record<string, AnilistListEntry[]>;
}

/**
 * A stand-in for graphql.anilist.co that answers our real queries from fixtures,
 * so tests exercise request building and response parsing without the network.
 */
export function fakeAnilist({ catalog = [], failWith, offline, lists = {} }: FakeOptions = {}) {
  const calls: { kind: string; variables: Record<string, unknown> }[] = [];
  const state = { catalog: [...catalog], failWith, offline };

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  const fetch: typeof globalThis.fetch = (_input, init) => {
    if (typeof init?.body !== "string") throw new Error("expected a JSON string body");
    const { query, variables } = JSON.parse(init.body) as {
      query: string;
      variables: Record<string, unknown>;
    };
    const kind = query.includes("MediaListCollection")
      ? "list"
      : query.includes("characters(")
        ? "characters"
        : query.includes("search:")
          ? "search"
          : query.includes("Media(id:")
            ? "byId"
            : "popular";
    calls.push({ kind, variables });

    if (state.offline) return Promise.reject(new TypeError("fetch failed"));
    if (state.failWith) {
      return Promise.resolve(
        new Response("{}", { status: state.failWith, headers: { "Retry-After": "30" } }),
      );
    }

    const find = (id: unknown) => state.catalog.find((m) => m.id === id);
    switch (kind) {
      case "list": {
        const entries = lists[String(variables.userName)];
        if (!entries) {
          return Promise.resolve(
            json(
              { data: { MediaListCollection: null }, errors: [{ message: "Private User" }] },
              404,
            ),
          );
        }
        const ofType = entries.filter((e) => e.media.type === variables.type);
        const perChunk = Number(variables.perChunk);
        const start = (Number(variables.chunk) - 1) * perChunk;
        return Promise.resolve(
          json({
            data: {
              MediaListCollection: {
                hasNextChunk: start + perChunk < ofType.length,
                lists: [{ entries: ofType.slice(start, start + perChunk) }],
              },
            },
          }),
        );
      }
      case "search": {
        const term = String(variables.search).toLowerCase();
        const type = variables.type as string | undefined;
        const matches = state.catalog.filter(
          (m) =>
            (!type || m.type === type) &&
            [m.title.romaji, m.title.english, m.title.native].some((t) =>
              t?.toLowerCase().includes(term),
            ),
        );
        return Promise.resolve(json({ data: { Page: { media: matches } } }));
      }
      case "byId": {
        const found = find(variables.id);
        return Promise.resolve(
          found
            ? json({ data: { Media: found } })
            : json(
                { data: { Media: null }, errors: [{ message: "Not Found.", status: 404 }] },
                404,
              ),
        );
      }
      case "characters": {
        const found = find(variables.id);
        if (!found) return Promise.resolve(json({ data: { Media: null } }, 404));
        return Promise.resolve(
          json({
            data: {
              Media: {
                characters: {
                  edges: [
                    {
                      role: "MAIN",
                      node: {
                        id: found.id * 100,
                        name: { full: `Hero of ${found.id}`, native: null },
                        image: { large: null },
                      },
                    },
                  ],
                },
              },
            },
          }),
        );
      }
      default:
        return Promise.resolve(json({ data: { Page: { media: state.catalog } } }));
    }
  };

  return {
    fetch,
    calls,
    state,
    count: (kind: string) => calls.filter((call) => call.kind === kind).length,
  };
}
