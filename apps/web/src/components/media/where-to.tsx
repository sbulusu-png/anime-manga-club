import Image from "next/image";

import type { MediaDetail, WhereToLink } from "@/lib/types";

/** Shown first: sites in English, or ones AniList doesn't tie to a language. */
const isMain = (link: WhereToLink) => link.language === null || link.language === "English";

function SiteLink({ link, showLanguage }: { link: WhereToLink; showLanguage: boolean }) {
  return (
    <li>
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-full border border-border bg-bg py-1.5 pl-1.5 pr-3.5 text-sm font-semibold hover:border-focus hover:bg-surface-2"
      >
        <span
          aria-hidden="true"
          style={link.color ? { backgroundColor: link.color } : undefined}
          className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2"
        >
          {link.icon ? (
            <Image src={link.icon} alt="" width={14} height={14} unoptimized className="size-3.5" />
          ) : (
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
          )}
        </span>
        {link.site}
        {showLanguage && link.language ? (
          <span className="font-normal text-muted">· {link.language}</span>
        ) : null}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </li>
  );
}

/**
 * The official places to watch or read a title, from AniList: English (or
 * language-neutral) sites first, others folded away, and the official site.
 */
export function WhereTo({ kind, links }: { kind: MediaDetail["kind"]; links: WhereToLink[] }) {
  if (links.length === 0) return null;
  const streams = links.filter((link) => link.kind === "stream");
  const official = links.filter((link) => link.kind === "official");
  const main = streams.filter(isMain);
  const others = streams.filter((link) => !isMain(link));
  const heading = kind === "anime" ? "Where to watch" : "Where to read";

  return (
    <section aria-labelledby="where-to-heading" className="flex flex-col gap-3">
      <h2 id="where-to-heading" className="text-xl font-bold">
        {heading}
      </h2>
      {streams.length === 0 ? (
        <p className="text-sm text-muted">
          No official {kind === "anime" ? "streaming" : "reading"} sites are listed yet.
        </p>
      ) : null}
      {main.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {main.map((link) => (
            <SiteLink key={link.url} link={link} showLanguage={false} />
          ))}
        </ul>
      ) : null}
      {others.length > 0 ? (
        // Opened straight away when there's nothing in English to show.
        <details open={main.length === 0} className="group">
          <summary className="cursor-pointer text-sm font-semibold text-link">
            {main.length > 0 ? "In other languages" : "Available in"} ({others.length})
          </summary>
          <ul className="mt-2 flex flex-wrap gap-2">
            {others.map((link) => (
              <SiteLink key={link.url} link={link} showLanguage />
            ))}
          </ul>
        </details>
      ) : null}
      {official.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted">Official sites</h3>
          <ul className="flex flex-wrap gap-2">
            {official.map((link) => (
              <SiteLink key={link.url} link={link} showLanguage />
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-muted">
        Availability depends on your country. Links from AniList.
      </p>
    </section>
  );
}
