import { z } from "zod";

/**
 * TMDB (themoviedb.org), for one thing: which services stream a show in India. Its
 * watch-provider data comes from JustWatch, which must be credited wherever it's shown.
 * https://developer.themoviedb.org/reference/tv-series-watch-providers
 */
const API = "https://api.themoviedb.org/3";
const LOGO_BASE = "https://image.tmdb.org/t/p/w92";
/** TMDB's genre id for animation, the same for TV and films. */
export const ANIMATION_GENRE = 16;

export type TmdbKind = "tv" | "movie";

const searchSchema = z.object({
  results: z.array(
    z.object({
      id: z.number().int(),
      // TV results have name/first_air_date, film results title/release_date.
      name: z.string().optional(),
      original_name: z.string().optional(),
      title: z.string().optional(),
      original_title: z.string().optional(),
      first_air_date: z.string().nullish(),
      release_date: z.string().nullish(),
      genre_ids: z.array(z.number().int()).default([]),
      popularity: z.number().default(0),
    }),
  ),
});

const providerSchema = z.object({
  provider_id: z.number().int(),
  provider_name: z.string(),
  logo_path: z.string().nullish(),
  display_priority: z.number().optional(),
});

const providersSchema = z.object({
  results: z.record(
    z.string(),
    z.object({
      link: z.string().optional(),
      flatrate: z.array(providerSchema).optional(),
      free: z.array(providerSchema).optional(),
      ads: z.array(providerSchema).optional(),
    }),
  ),
});

export interface TmdbResult {
  id: number;
  name: string;
  originalName: string;
  /** The year it first aired or was released, if TMDB knows. */
  year: number | null;
  isAnimation: boolean;
  popularity: number;
}

export interface TmdbProvider {
  id: number;
  name: string;
  logoUrl: string | null;
  /** "subscription", or free (with or without ads). */
  offer: "subscription" | "free";
}

export interface TmdbProviders {
  /** TMDB's page for the title's providers in that country (it links on to each). */
  link: string | null;
  providers: TmdbProvider[];
}

export interface TmdbClient {
  search(kind: TmdbKind, query: string, year?: number): Promise<TmdbResult[]>;
  /** Where the title streams in one country (e.g. "IN"), or null if nowhere. */
  watchProviders(kind: TmdbKind, id: number, country: string): Promise<TmdbProviders | null>;
}

const yearOf = (date: string | null | undefined) => {
  const year = date ? Number(date.slice(0, 4)) : NaN;
  return Number.isInteger(year) && year > 1900 ? year : null;
};

export function createTmdbClient({
  token,
  fetch: fetchImpl = fetch,
}: {
  /** TMDB's "API Read Access Token" (a long token, not the short API key). */
  token: string;
  fetch?: typeof fetch;
}): TmdbClient {
  async function get(path: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(`${API}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`TMDB answered ${String(res.status)} for ${path}`);
    return res.json();
  }

  return {
    async search(kind, query, year) {
      const params: Record<string, string> = { query, include_adult: "false" };
      if (year)
        params[kind === "tv" ? "first_air_date_year" : "primary_release_year"] = String(year);
      const { results } = searchSchema.parse(await get(`/search/${kind}`, params));
      return results.map((r) => ({
        id: r.id,
        name: r.name ?? r.title ?? "",
        originalName: r.original_name ?? r.original_title ?? "",
        year: yearOf(r.first_air_date ?? r.release_date),
        isAnimation: r.genre_ids.includes(ANIMATION_GENRE),
        popularity: r.popularity,
      }));
    },

    async watchProviders(kind, id, country) {
      const { results } = providersSchema.parse(
        await get(`/${kind}/${String(id)}/watch/providers`),
      );
      const here = results[country];
      if (!here) return null;
      const seen = new Set<number>();
      const providers: TmdbProvider[] = [];
      const add = (
        list: z.infer<typeof providerSchema>[] | undefined,
        offer: TmdbProvider["offer"],
      ) => {
        for (const p of [...(list ?? [])].sort(
          (a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99),
        )) {
          if (seen.has(p.provider_id)) continue;
          seen.add(p.provider_id);
          providers.push({
            id: p.provider_id,
            name: p.provider_name,
            logoUrl: p.logo_path ? `${LOGO_BASE}${p.logo_path}` : null,
            offer,
          });
        }
      };
      add(here.flatrate, "subscription");
      add(here.free, "free");
      add(here.ads, "free");
      return providers.length > 0 ? { link: here.link ?? null, providers } : null;
    },
  };
}
