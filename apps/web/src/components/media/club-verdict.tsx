import type { MediaDetail } from "@/lib/types";

import { EvaluationBar } from "../evaluation-bar";
import { VerdictBadge } from "../verdict-badge";

/** The club's overall verdict on a title, and how members split across the four. */
export function ClubVerdict({
  club,
  wide = false,
}: {
  club: MediaDetail["club"];
  /** In the main column: a bigger heading, and the gauge beside its legend. */
  wide?: boolean;
}) {
  const total = club.reviewCount;

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
        <>
          <EvaluationBar
            counts={club.breakdown}
            wide={wide}
            center={
              <>
                <VerdictBadge rating={club.verdict} />
                <span className="text-xs text-muted">
                  from {total} {total === 1 ? "review" : "reviews"}
                </span>
              </>
            }
          />
        </>
      ) : (
        <p className="text-sm text-muted">No verdicts yet. Be the first to give one!</p>
      )}
    </section>
  );
}
