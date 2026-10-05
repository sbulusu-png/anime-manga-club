/** Browse filters, kept in the URL so every search can be shared and bookmarked. */

export const SORTS = [
  { value: "popularity", label: "Most popular" },
  { value: "score", label: "Highest rated" },
  { value: "club", label: "Club favourites" },
  { value: "newest", label: "Newest" },
  { value: "title", label: "A–Z" },
] as const;

export const ANIME_FORMATS = [
  { value: "TV", label: "TV" },
  { value: "TV_SHORT", label: "TV short" },
  { value: "MOVIE", label: "Movie" },
  { value: "SPECIAL", label: "Special" },
  { value: "OVA", label: "OVA" },
  { value: "ONA", label: "ONA" },
  { value: "MUSIC", label: "Music" },
] as const;

export const MANGA_FORMATS = [
  { value: "MANGA", label: "Manga" },
  { value: "NOVEL", label: "Light novel" },
  { value: "ONE_SHOT", label: "One-shot" },
] as const;

export const STATUSES = [
  { value: "RELEASING", label: "Airing / publishing" },
  { value: "FINISHED", label: "Finished" },
  { value: "NOT_YET_RELEASED", label: "Not yet released" },
  { value: "HIATUS", label: "On hiatus" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export const SEASONS = [
  { value: "WINTER", label: "Winter" },
  { value: "SPRING", label: "Spring" },
  { value: "SUMMER", label: "Summer" },
  { value: "FALL", label: "Fall" },
] as const;

/** Titles per page of results. */
export const PAGE_SIZE = 24;

/** The results grid, shared by the browse list and the AniList results. */
export const RESULTS_GRID =
  "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6";

export type Sort = (typeof SORTS)[number]["value"];
export type MediaType = "anime" | "manga" | "manhwa" | "manhua";

/** "Manhwa", for headings and labels. */
export const KIND_LABELS: Record<MediaType, string> = {
  anime: "Anime",
  manga: "Manga",
  manhwa: "Manhwa",
  manhua: "Manhua",
};

export interface Filters {
  q: string;
  type: MediaType | null;
  genres: string[];
  format: string | null;
  status: string | null;
  season: string | null;
  year: number | null;
  sort: Sort;
}

export const EMPTY_FILTERS: Filters = {
  q: "",
  type: null,
  genres: [],
  format: null,
  status: null,
  season: null,
  year: null,
  sort: "popularity",
};

export const MIN_YEAR = 1940;
export const MAX_YEAR = new Date().getFullYear() + 2;

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
const oneOf = <T extends string>(value: string, options: readonly { value: T }[]): T | null =>
  options.find((option) => option.value === value)?.value ?? null;

/**
 * Reads filters from the URL. Anything unexpected is dropped rather than rejected, so an
 * old or hand-edited link still shows results instead of an error.
 */
export function parseFilters(params: Params): Filters {
  const type = oneOf(
    first(params.type),
    (Object.keys(KIND_LABELS) as MediaType[]).map((value) => ({ value })),
  );
  const formats =
    type === "anime" ? ANIME_FORMATS : type ? MANGA_FORMATS : [...ANIME_FORMATS, ...MANGA_FORMATS];
  const genreValues = params.genre === undefined ? [] : [params.genre].flat();
  const year = Number(first(params.year));

  return {
    q: first(params.q).slice(0, 100),
    type,
    genres: [...new Set(genreValues.map((g) => g.trim()).filter((g) => g && g.length <= 50))].slice(
      0,
      10,
    ),
    format: oneOf(first(params.format), formats),
    status: oneOf(first(params.status), STATUSES),
    // Seasons only exist for anime.
    season: type && type !== "anime" ? null : oneOf(first(params.season), SEASONS),
    year: Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR ? year : null,
    sort: oneOf(first(params.sort), SORTS) ?? "popularity",
  };
}

/** The filters as a query string, leaving out defaults so URLs stay short. */
export function toSearchParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.type) params.set("type", filters.type);
  for (const genre of filters.genres) params.append("genre", genre);
  if (filters.format) params.set("format", filters.format);
  if (filters.status) params.set("status", filters.status);
  if (filters.season) params.set("season", filters.season);
  if (filters.year) params.set("year", String(filters.year));
  if (filters.sort !== "popularity") params.set("sort", filters.sort);
  return params;
}

/** "/api/media?type=anime&limit=24", the API request for one page of results. */
export function mediaApiPath(filters: Filters, limit: number, cursor?: string): `/api/${string}` {
  const params = toSearchParams(filters);
  // The API's default sort is popularity too, but be explicit about it.
  params.set("sort", filters.sort);
  params.set("limit", String(limit));
  if (cursor) params.set("cursor", cursor);
  return `/api/media?${params.toString()}`;
}

export function hasFilters(filters: Filters): boolean {
  return toSearchParams({ ...filters, sort: "popularity" }).size > 0;
}
