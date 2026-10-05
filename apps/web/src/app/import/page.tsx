import type { Metadata } from "next";

import { ImportListForm } from "@/components/list/import-list-form";
import { requireMember } from "@/lib/server-api";
import { AnimeHeading } from "@/components/anime-heading";

export const metadata: Metadata = { title: "Import your list", robots: { index: false } };

export default async function ImportPage() {
  const user = await requireMember("/import");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <AnimeHeading jp="インポート" className="text-5xl">
          Import your list
        </AnimeHeading>
        <p className="text-muted">
          Bring over your anime and manga from AniList. Each title keeps its status (watching,
          completed, paused or dropped) and your score, and your suggestions learn from them
          straight away.
        </p>
      </header>

      <section className="manga-panel rounded-2xl bg-surface p-5">
        <ImportListForm username={user.username ?? ""} />
      </section>

      <section className="flex flex-col gap-2 text-sm text-muted">
        <h2 className="font-semibold text-ink">Good to know</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            On MyAnimeList? AniList can import a MyAnimeList list first (AniList settings, then
            Import Lists), and then you can bring it here.
          </li>
          <li>
            &ldquo;Planning&rdquo; titles are skipped: the club keeps what you&apos;ve watched, not
            what you mean to.
          </li>
          <li>Your AniList scores stay private; they only shape your own suggestions.</li>
        </ul>
      </section>
    </div>
  );
}
