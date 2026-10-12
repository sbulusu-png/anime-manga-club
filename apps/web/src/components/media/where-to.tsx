import Image from "next/image";

import type { MediaDetail, WhereToLink } from "@/lib/types";

/** Shown first: sites in English, or ones AniList doesn't tie to a language. */
const isMain = (link: WhereToLink) => link.language === null || link.language === "English";

/** Several services can share a link (TMDB's page for the title), so key by both. */
const keyOf = (link: WhereToLink) => `${link.site}|${link.url}`;

function Globe() {
  return (
    // A globe for sites without a logo (usually the official site).
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="size-3.5 text-muted"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

function SiteLink({ link, showLanguage }: { link: WhereToLink; showLanguage: boolean }) {
  return (
    <li>
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-full border border-border bg-bg py-1.5 pl-1.5 pr-3.5 text-sm font-semibold hover:border-focus hover:bg-surface-2"
      >
        {link.logo ? (
          // Streaming services' own full-colour logos (from TMDB).
          <Image
            src={link.logo}
            alt=""
            width={24}
            height={24}
            unoptimized
            className="size-6 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            style={link.color ? { backgroundColor: link.color } : undefined}
            className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2"
          >
            {link.icon ? (
              <Image
                src={link.icon}
                alt=""
                width={14}
                height={14}
                unoptimized
                className="size-3.5"
              />
            ) : (
              <Globe />
            )}
          </span>
        )}
        {link.site}
        {link.free ? (
          <span className="rounded-full bg-verdict-go-soft px-1.5 py-0.5 text-xs text-verdict-go">
            Free
          </span>
        ) : null}
        {showLanguage && link.language ? (
          <span className="font-normal text-muted">· {link.language}</span>
        ) : null}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </li>
  );
}

function SiteList({ links, showLanguage }: { links: WhereToLink[]; showLanguage: boolean }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {links.map((link) => (
        <SiteLink key={keyOf(link)} link={link} showLanguage={showLanguage} />
      ))}
    </ul>
  );
}

function OfficialSites({ links }: { links: WhereToLink[] }) {
  if (links.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-muted">Official sites</h3>
      <SiteList links={links} showLanguage />
    </div>
  );
}

/**
 * Anime: where it streams in India, title by title (JustWatch's data, via TMDB), since
 * AniList's streaming links are worldwide. Without that data, a JustWatch search.
 */
function WatchInIndia({
  links,
  india,
}: {
  links: WhereToLink[];
  india: NonNullable<MediaDetail["watchInIndia"]>;
}) {
  const streams = links.filter((link) => link.kind === "stream");
  return (
    <section aria-labelledby="where-to-heading" className="flex flex-col gap-3">
      <h2 id="where-to-heading" className="text-xl font-bold">
        Where to watch in India
      </h2>
      {streams.length > 0 ? (
        <SiteList links={streams} showLanguage={false} />
      ) : india.matched ? (
        <p className="text-sm text-muted">
          Not streaming in India right now, according to JustWatch.
        </p>
      ) : (
        <a
          href={india.moreUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start rounded-full border border-border bg-bg px-4 py-2 text-sm font-semibold hover:border-focus hover:bg-surface-2"
        >
          Check where to watch in India<span aria-hidden="true"> ↗</span>
          <span className="sr-only"> (opens JustWatch in a new tab)</span>
        </a>
      )}
      <OfficialSites links={links.filter((link) => link.kind === "official")} />
      <p className="text-xs text-muted">
        {india.matched ? (
          <>
            Streaming in India from{" "}
            <a href="https://www.justwatch.com/in" className="text-link underline" rel="noreferrer">
              JustWatch
            </a>
            , via{" "}
            <a href="https://www.themoviedb.org" className="text-link underline" rel="noreferrer">
              TMDB
            </a>
            .{" "}
            <a href={india.moreUrl} className="text-link underline" rel="noreferrer">
              All options
            </a>
          </>
        ) : (
          "Streaming catalogues change often; JustWatch shows what's on in India today."
        )}
      </p>
    </section>
  );
}

/**
 * The official places to watch or read a title. Anime: what streams it in India. Manga,
 * manhwa and manhua: AniList's reading sites, English (or language-neutral) ones first,
 * others folded away. Then the official site.
 */
export function WhereTo({
  kind,
  links,
  india,
}: {
  kind: MediaDetail["kind"];
  links: WhereToLink[];
  /** Missing in page data cached before it existed: then the anime is shown like before. */
  india: MediaDetail["watchInIndia"];
}) {
  if (kind === "anime" && india) return <WatchInIndia links={links} india={india} />;
  if (links.length === 0) return null;
  const streams = links.filter((link) => link.kind === "stream");
  const main = streams.filter(isMain);
  const others = streams.filter((link) => !isMain(link));

  return (
    <section aria-labelledby="where-to-heading" className="flex flex-col gap-3">
      <h2 id="where-to-heading" className="text-xl font-bold">
        {kind === "anime" ? "Where to watch" : "Where to read"}
      </h2>
      {streams.length === 0 ? (
        <p className="text-sm text-muted">
          No official {kind === "anime" ? "streaming" : "reading"} sites are listed yet.
        </p>
      ) : null}
      {main.length > 0 ? <SiteList links={main} showLanguage={false} /> : null}
      {others.length > 0 ? (
        // Opened straight away when there's nothing in English to show.
        <details open={main.length === 0} className="group">
          <summary className="cursor-pointer text-sm font-semibold text-link">
            {main.length > 0 ? "In other languages" : "Available in"} ({others.length})
          </summary>
          <div className="mt-2">
            <SiteList links={others} showLanguage />
          </div>
        </details>
      ) : null}
      <OfficialSites links={links.filter((link) => link.kind === "official")} />
      <p className="text-xs text-muted">
        Availability depends on your country. Links from AniList.
      </p>
    </section>
  );
}
