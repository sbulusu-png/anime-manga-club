import Image from "next/image";
import Link from "next/link";

import type { MediaSummary } from "@/lib/types";

import { VerdictBadge } from "./verdict-badge";

const FORMAT_LABELS: Record<string, string> = {
  TV: "TV",
  TV_SHORT: "TV short",
  MOVIE: "Movie",
  SPECIAL: "Special",
  OVA: "OVA",
  ONA: "ONA",
  MUSIC: "Music",
  MANGA: "Manga",
  NOVEL: "Light novel",
  ONE_SHOT: "One-shot",
};

/** "TV short", "Light novel"; falls back to the type when AniList has no format. */
export function formatLabel(media: Pick<MediaSummary, "type" | "format">): string {
  const format = media.format ? (FORMAT_LABELS[media.format] ?? media.format) : null;
  return format ?? (media.type === "anime" ? "Anime" : "Manga");
}

/** "TV · 2013", "Manga · 1997", or just the type when AniList has no details. */
export function mediaMeta(media: Pick<MediaSummary, "type" | "format" | "year">): string {
  const kind = formatLabel(media);
  return media.year ? `${kind} · ${media.year}` : kind;
}

/** A cover-art card linking to the title's page. */
export function MediaCard({
  media,
  priority = false,
}: {
  media: MediaSummary;
  priority?: boolean;
}) {
  return (
    <Link
      href={`/media/${media.id}`}
      className="group flex flex-col gap-2 rounded-2xl outline-offset-4"
    >
      <div
        className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-border shadow-card"
        style={{ backgroundColor: media.coverColor ?? "var(--surface-2)" }}
      >
        {media.coverImageUrl && (
          <Image
            src={media.coverImageUrl}
            alt=""
            fill
            priority={priority}
            sizes="(max-width: 639px) 45vw, (max-width: 1023px) 30vw, 180px"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
        {media.club.verdict && (
          <span className="absolute left-2 top-2 shadow-card">
            <span className="sr-only">Club verdict: </span>
            <VerdictBadge rating={media.club.verdict} size="sm" />
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-0.5">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug group-hover:underline">
          {media.title.display}
        </h3>
        <p className="flex items-center gap-2 text-xs text-muted">
          <span>{mediaMeta(media)}</span>
          {media.anilistScore !== null && (
            <span>
              <span aria-hidden="true">★</span>
              <span className="sr-only">AniList score</span> {media.anilistScore}%
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}
