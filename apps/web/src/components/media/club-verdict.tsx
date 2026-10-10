import type { Route } from "next";
import Link from "next/link";

import { RATING_INFO } from "@/lib/rating";
import type { MediaDetail } from "@/lib/types";

import { VerdictBadge } from "../verdict-badge";
import { ClubVerdictEditor } from "./club-verdict-editor";

const givenOn = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

/** The club's verdict on a title, given by a club lead; leads can change it here. */
export function ClubVerdict({
  mediaId,
  club,
  canEdit = false,
  wide = false,
}: {
  mediaId: number;
  club: MediaDetail["club"];
  /** Club leads see buttons to give, change or remove it. */
  canEdit?: boolean;
  /** In the main column: a bigger heading. */
  wide?: boolean;
}) {
  const giver = club.givenBy?.username ? club.givenBy : null;

  return (
    <section
      aria-labelledby="club-verdict-heading"
      className={`flex flex-col gap-3 rounded-2xl border border-border bg-surface ${wide ? "p-5" : "p-4"}`}
    >
      <h2
        id="club-verdict-heading"
        className={wide ? "text-xl font-bold" : "text-sm font-semibold text-muted"}
      >
        Club verdict
      </h2>
      {club.verdict ? (
        <div className="flex flex-col items-start gap-2">
          <VerdictBadge rating={club.verdict} className="px-4 py-1.5 text-base" />
          <p className="text-sm text-muted">{RATING_INFO[club.verdict].blurb}</p>
          {giver || club.givenAt ? (
            <p className="text-xs text-muted">
              Given
              {giver ? (
                <>
                  {" by "}
                  <Link
                    href={`/u/${giver.username ?? ""}` as Route}
                    className="font-semibold text-link hover:underline"
                  >
                    @{giver.displayUsername ?? giver.username}
                  </Link>
                </>
              ) : null}
              {club.givenAt ? ` on ${givenOn.format(new Date(club.givenAt))}` : null}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted">The club lead hasn&apos;t given a verdict yet.</p>
      )}
      {canEdit ? <ClubVerdictEditor mediaId={mediaId} current={club.verdict} /> : null}
    </section>
  );
}
