import type { WhereToLink } from "../lib/anilist.js";
import { titleKey } from "../lib/title-key.js";
import type { TmdbClient, TmdbKind, TmdbResult } from "../lib/tmdb.js";
import { TtlCache } from "../lib/ttl-cache.js";
import type { MediaRow } from "./media.js";

/**
 * Where an anime streams in India. AniList's links are worldwide (Crunchyroll may carry a
 * show in the US and not in India), so this asks JustWatch, through TMDB, what each
 * service offers here, title by title.
 */
export interface WatchInIndia {
  /** Whether the title was found on TMDB; if not, only `moreUrl` is useful. */
  matched: boolean;
  /** JustWatch-backed services streaming it in India, best first. */
  links: WhereToLink[];
  /** Where to see the full picture: TMDB's India page for it, or a JustWatch search. */
  moreUrl: string;
}

const COUNTRY = "IN";
const DAY = 24 * 60 * 60 * 1000;
// Which TMDB entry a title is changes rarely; what streams it changes more often.
const matchCache = new TtlCache<{ kind: TmdbKind; id: number } | null>(7 * DAY, 3000);
const providerCache = new TtlCache<Awaited<ReturnType<TmdbClient["watchProviders"]>>>(DAY, 3000);

/**
 * "Attack on Titan Season 3 Part 2" -> "Attack on Titan": AniList lists each season on
 * its own, TMDB lists the show once.
 */
export function baseTitle(title: string): string {
  const marker =
    /(\b(season\s*\d+|\d+(st|nd|rd|th)\s+season|(the\s+)?final\s+(season|chapters?)|part\s*\d+|cour\s*\d+)\b|第\s*\d+\s*期)/i;
  const cut = marker.exec(title);
  const base = cut ? title.slice(0, cut.index) : title;
  return base.replace(/[\s:：\-–—]+$/u, "").trim() || title;
}

/** Forgets cached answers (for tests, which reuse titles with different fakes). */
export function forgetWatchInIndia() {
  matchCache.clear();
  providerCache.clear();
}

export const justWatchSearchUrl = (title: string) =>
  `https://www.justwatch.com/in/search?q=${encodeURIComponent(title)}`;

type Titles = Pick<
  MediaRow,
  "titleEnglish" | "titleRomaji" | "titleNative" | "format" | "seasonYear" | "startYear"
>;

/** Finds the title's TMDB entry: an animation whose name or Japanese name matches. */
export async function findTmdbMatch(tmdb: TmdbClient, media: Titles) {
  const kind: TmdbKind = media.format === "MOVIE" ? "movie" : "tv";
  const year = media.seasonYear ?? media.startYear ?? undefined;
  const names = [
    ...new Set([media.titleEnglish, media.titleRomaji].filter((t): t is string => !!t)),
  ];
  const bases = [...new Set(names.map(baseTitle))].filter((b) => !names.includes(b));
  const latin = new Set([...names, ...bases].map(titleKey));
  const native = media.titleNative
    ? new Set([titleKey(media.titleNative), titleKey(baseTitle(media.titleNative))])
    : new Set<string>();

  const fits = (r: TmdbResult) =>
    r.isAnimation && (latin.has(titleKey(r.name)) || native.has(titleKey(r.originalName)));

  // The title as it is, in its year first; then the show a later season belongs to.
  const searches: [string, number | undefined][] = [
    ...names.map((n): [string, number | undefined] => [n, year]),
    ...bases.map((b): [string, undefined] => [b, undefined]),
  ];
  for (const [query, inYear] of searches.slice(0, 4)) {
    const results = (await tmdb.search(kind, query, inYear))
      .filter(fits)
      // A sequel's show started in or before the sequel's year.
      .filter((r) => inYear !== undefined || !year || r.year === null || r.year <= year)
      .sort((a, b) => b.popularity - a.popularity);
    const best = results[0];
    if (best) return { kind, id: best.id };
  }
  return null;
}

/** "Amazon Prime Video" and "Prime Video" are one service. */
const serviceKey = (name: string) => titleKey(name).replace(/^amazon /, "");

export async function watchInIndia(
  tmdb: TmdbClient | null,
  media: Titles & Pick<MediaRow, "anilistId">,
  /** AniList's links for the title: where a service matches, its direct link is used. */
  anilistLinks: readonly WhereToLink[],
): Promise<WatchInIndia> {
  const display = media.titleEnglish ?? media.titleRomaji;
  const fallback: WatchInIndia = {
    matched: false,
    links: [],
    moreUrl: justWatchSearchUrl(display),
  };
  if (!tmdb) return fallback;

  const key = String(media.anilistId);
  let match = matchCache.get(key);
  if (match === undefined) {
    match = await findTmdbMatch(tmdb, media);
    matchCache.set(key, match);
  }
  if (!match) return fallback;

  const providerKey = `${match.kind}:${String(match.id)}`;
  let found = providerCache.get(providerKey);
  if (found === undefined) {
    found = await tmdb.watchProviders(match.kind, match.id, COUNTRY);
    providerCache.set(providerKey, found);
  }
  const moreUrl = found?.link ?? fallback.moreUrl;
  if (!found) return { matched: true, links: [], moreUrl };

  const direct = new Map(
    anilistLinks.filter((l) => l.kind === "stream").map((l) => [serviceKey(l.site), l.url]),
  );
  const links: WhereToLink[] = found.providers.map((p) => ({
    site: p.name,
    url: direct.get(serviceKey(p.name)) ?? moreUrl,
    kind: "stream",
    language: null,
    color: null,
    icon: null,
    logo: p.logoUrl,
    free: p.offer === "free",
  }));
  return { matched: true, links, moreUrl };
}
