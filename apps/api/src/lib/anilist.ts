import { z } from "zod";

import type { media } from "../db/schema/index.js";
import { AppError } from "./errors.js";

const ANILIST_URL = "https://graphql.anilist.co";

const MEDIA_FIELDS = `
  id
  idMal
  type
  format
  status
  title { romaji english native }
  description(asHtml: false)
  coverImage { extraLarge color }
  bannerImage
  genres
  tags { name rank isMediaSpoiler isAdult }
  season
  seasonYear
  startDate { year }
  episodes
  chapters
  volumes
  averageScore
  popularity
  isAdult
`;

const POPULAR_QUERY = `
  query ($page: Int!, $perPage: Int!, $type: MediaType!) {
    Page(page: $page, perPage: $perPage) {
      media(type: $type, sort: POPULARITY_DESC, isAdult: false) { ${MEDIA_FIELDS} }
    }
  }
`;

const SEARCH_QUERY = `
  query ($search: String!, $perPage: Int!, $type: MediaType) {
    Page(page: 1, perPage: $perPage) {
      media(search: $search, type: $type, sort: SEARCH_MATCH, isAdult: false) { ${MEDIA_FIELDS} }
    }
  }
`;

const BY_ID_QUERY = `
  query ($id: Int!) {
    Media(id: $id) { ${MEDIA_FIELDS} }
  }
`;

const CHARACTERS_QUERY = `
  query ($id: Int!, $perPage: Int!) {
    Media(id: $id) {
      characters(sort: [ROLE, RELEVANCE], perPage: $perPage) {
        edges {
          role
          node { id name { full native } image { large } }
        }
      }
    }
  }
`;

const anilistMediaSchema = z.object({
  id: z.number().int(),
  idMal: z.number().int().nullable(),
  type: z.enum(["ANIME", "MANGA"]),
  format: z.string().nullable(),
  status: z.string().nullable(),
  title: z.object({
    romaji: z.string(),
    english: z.string().nullable(),
    native: z.string().nullable(),
  }),
  description: z.string().nullable(),
  coverImage: z.object({ extraLarge: z.string().nullable(), color: z.string().nullable() }),
  bannerImage: z.string().nullable(),
  genres: z.array(z.string()),
  tags: z.array(
    z.object({
      name: z.string(),
      rank: z.number().nullable(),
      isMediaSpoiler: z.boolean(),
      isAdult: z.boolean(),
    }),
  ),
  season: z.string().nullable(),
  seasonYear: z.number().int().nullable(),
  startDate: z.object({ year: z.number().int().nullable() }),
  episodes: z.number().int().nullable(),
  chapters: z.number().int().nullable(),
  volumes: z.number().int().nullable(),
  averageScore: z.number().int().nullable(),
  popularity: z.number().int().nullable(),
  isAdult: z.boolean(),
});

export type AnilistMedia = z.infer<typeof anilistMediaSchema>;

const pageSchema = z.object({
  data: z.object({ Page: z.object({ media: z.array(anilistMediaSchema) }) }),
});
const byIdSchema = z.object({ data: z.object({ Media: anilistMediaSchema.nullable() }) });
const charactersSchema = z.object({
  data: z.object({
    Media: z
      .object({
        characters: z.object({
          edges: z.array(
            z.object({
              role: z.string().nullable(),
              node: z.object({
                id: z.number().int(),
                name: z.object({ full: z.string().nullable(), native: z.string().nullable() }),
                image: z.object({ large: z.string().nullable() }),
              }),
            }),
          ),
        }),
      })
      .nullable(),
  }),
});

/** Validates an AniList response; a shape we don't expect means AniList changed or broke. */
function parse<T>(schema: z.ZodType<T>, json: unknown): T {
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new AppError(502, "CATALOG_UNAVAILABLE", "AniList sent an unexpected response.", {
      cause: result.error,
    });
  }
  return result.data;
}

export interface Character {
  anilistId: number;
  name: string;
  nativeName: string | null;
  imageUrl: string | null;
  role: string | null; // MAIN, SUPPORTING, BACKGROUND
}

export interface AnilistClientOptions {
  fetch?: typeof fetch;
  /** Shared budget across the whole API; AniList allows ~30-90 requests/minute. */
  maxRequestsPerMinute?: number;
  timeoutMs?: number;
  /** Scripts may wait out a 429; request handlers should fail fast instead. */
  waitOnRateLimit?: boolean;
}

export function createAnilistClient({
  fetch: fetchImpl = fetch,
  maxRequestsPerMinute = 25,
  timeoutMs = 8_000,
  waitOnRateLimit = false,
}: AnilistClientOptions = {}) {
  let windowStart = 0;
  let used = 0;

  function takeBudget() {
    const now = Date.now();
    if (now - windowStart >= 60_000) {
      windowStart = now;
      used = 0;
    }
    if (used >= maxRequestsPerMinute) {
      throw new AppError(503, "CATALOG_BUSY", "The catalog is busy right now. Try again shortly.");
    }
    used++;
  }

  async function query(body: { query: string; variables: Record<string, unknown> }) {
    for (let attempt = 0; ; attempt++) {
      takeBudget();
      let res: Response;
      try {
        res = await fetchImpl(ANILIST_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        throw new AppError(502, "CATALOG_UNAVAILABLE", "Couldn't reach AniList.", { cause: err });
      }

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? 60);
        if (waitOnRateLimit && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
        throw new AppError(
          503,
          "CATALOG_BUSY",
          "The catalog is busy right now. Try again shortly.",
        );
      }
      // AniList answers 404 (with a JSON body) when a Media id doesn't exist.
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new AppError(502, "CATALOG_UNAVAILABLE", `AniList responded ${res.status}.`);
      }
      return res.json();
    }
  }

  return {
    /** The most popular non-adult titles of one type. */
    async popular(type: "ANIME" | "MANGA", page = 1, perPage = 50) {
      const json = await query({ query: POPULAR_QUERY, variables: { page, perPage, type } });
      return parse(pageSchema, json).data.Page.media;
    },

    /** Best matches for a search term, adult titles excluded. */
    async search(search: string, type?: "ANIME" | "MANGA", perPage = 10) {
      const json = await query({
        query: SEARCH_QUERY,
        variables: { search, perPage, ...(type && { type }) },
      });
      return parse(pageSchema, json).data.Page.media;
    },

    /** One title by AniList id, or null if it doesn't exist. */
    async byId(id: number) {
      const json = await query({ query: BY_ID_QUERY, variables: { id } });
      return json === null ? null : parse(byIdSchema, json).data.Media;
    },

    /** Main characters first, then supporting. */
    async characters(id: number, perPage = 12): Promise<Character[]> {
      const json = await query({ query: CHARACTERS_QUERY, variables: { id, perPage } });
      if (json === null) return [];
      const edges = parse(charactersSchema, json).data.Media?.characters.edges ?? [];
      return edges.map(({ role, node }) => ({
        anilistId: node.id,
        name: node.name.full ?? node.name.native ?? "Unknown",
        nativeName: node.name.native,
        imageUrl: node.image.large,
        role,
      }));
    },
  };
}

export type AnilistClient = ReturnType<typeof createAnilistClient>;

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#039;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
};

/** AniList descriptions contain light HTML; store them as plain text. */
export function cleanDescription(description: string | null): string | null {
  if (!description) return null;
  const text = description
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;|&#\d+;/gi, (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

const MAX_TAGS = 10;
const MIN_TAG_RANK = 60;

/** Maps an AniList record onto a row of the `media` table. */
export function toMediaRow(item: AnilistMedia): typeof media.$inferInsert {
  return {
    anilistId: item.id,
    malId: item.idMal,
    type: item.type === "ANIME" ? "anime" : "manga",
    format: item.format,
    status: item.status,
    titleRomaji: item.title.romaji,
    titleEnglish: item.title.english,
    titleNative: item.title.native,
    synopsis: cleanDescription(item.description),
    coverImageUrl: item.coverImage.extraLarge,
    coverColor: item.coverImage.color,
    bannerImageUrl: item.bannerImage,
    genres: item.genres,
    // Drop spoiler/adult tags and weak matches; keep the strongest few.
    tags: item.tags
      .filter((t) => !t.isMediaSpoiler && !t.isAdult && (t.rank ?? 0) >= MIN_TAG_RANK)
      .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
      .slice(0, MAX_TAGS)
      .map((t) => t.name),
    season: item.season,
    seasonYear: item.seasonYear,
    startYear: item.startDate.year,
    episodes: item.episodes,
    chapters: item.chapters,
    volumes: item.volumes,
    anilistScore: item.averageScore,
    popularity: item.popularity,
    isAdult: item.isAdult,
    syncedAt: new Date(),
  };
}
