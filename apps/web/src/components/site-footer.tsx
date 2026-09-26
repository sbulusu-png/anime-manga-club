import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-display text-lg tracking-wide text-ink">Anime Manga Club</span> ·
          Reviews, suggestions and debates.
        </p>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          <li>
            <Link href="/credits" className="hover:text-ink hover:underline">
              Credits
            </Link>
          </li>
          <li>
            {/* Served by the API through the /api proxy, so a plain link (not next/link). */}
            <a href="/api/docs" className="hover:text-ink hover:underline">
              API docs
            </a>
          </li>
          <li>
            <a
              href="https://anilist.co"
              className="hover:text-ink hover:underline"
              rel="noreferrer"
            >
              Data from AniList
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
