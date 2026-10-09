import type { Metadata } from "next";

import { ImportListForm } from "@/components/list/import-list-form";
import { TypeListForm } from "@/components/list/type-list-form";
import { requireMember } from "@/lib/server-api";
import { AnimeHeading } from "@/components/anime-heading";

export const metadata: Metadata = { title: "Add your list", robots: { index: false } };

export default async function ImportPage() {
  const user = await requireMember("/import");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <AnimeHeading jp="マイリスト" className="text-5xl">
          Add your list
        </AnimeHeading>
        <p className="text-muted">
          Tell us what you&apos;ve watched and read: type it in, or bring it over from AniList. Your
          suggestions learn from it straight away.
        </p>
      </header>

      <section
        aria-labelledby="type-heading"
        className="manga-panel flex flex-col gap-4 rounded-2xl bg-surface p-5"
      >
        <h2 id="type-heading" className="text-xl font-bold">
          Type your list
        </h2>
        <TypeListForm />
      </section>

      <section
        aria-labelledby="anilist-heading"
        className="manga-panel flex flex-col gap-4 rounded-2xl bg-surface p-5"
      >
        <div>
          <h2 id="anilist-heading" className="text-xl font-bold">
            Or import from AniList
          </h2>
          <p className="mt-1 text-sm text-muted">Each title keeps its status and your score.</p>
        </div>
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
