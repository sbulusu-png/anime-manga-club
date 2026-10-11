import type { ReactNode } from "react";

import { AnimeHeading } from "./anime-heading";

/** The frame for the privacy policy and terms: a heading, the date, then sections. */
export function LegalPage({
  title,
  jp,
  updated,
  intro,
  children,
}: {
  title: string;
  /** The title in Japanese, drawn as the heading's watermark. */
  jp: string;
  /** "11 October 2026" */
  updated: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <AnimeHeading jp={jp} className="text-5xl">
        {title}
      </AnimeHeading>
      <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
      <div className="mt-6 text-muted">{intro}</div>
      <div className="mt-8 flex flex-col gap-8 leading-relaxed [&_a]:text-link [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </div>
    </article>
  );
}
