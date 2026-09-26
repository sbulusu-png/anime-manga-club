import type { ReactNode } from "react";

import { RATINGS, RATING_INFO, type Rating } from "@/lib/rating";

const PERCENT = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 0 });

// A half circle from the left (Skip) over the top to the right (Perfection).
const ARC = "M 20 100 A 80 80 0 0 1 180 100";
// With pathLength={100}, every arc is measured in percent of the half circle.
const GAP = 1.2;

/**
 * How the votes split, as a semicircle gauge: Skip on the left round to Perfection on
 * the right, each arc sized by its share (like a chess evaluation bar, bent into a
 * speedometer). `center` sits inside the curve; the legend underneath gives exact
 * counts, so nothing depends on reading the colours.
 */
export function EvaluationBar({
  counts,
  noun = "vote",
  center,
}: {
  counts: Record<Rating, number>;
  /** What each count is ("vote", "review"), for the screen-reader summary. */
  noun?: string;
  center?: ReactNode;
}) {
  const total = RATINGS.reduce((sum, rating) => sum + counts[rating], 0);
  const plural = (n: number) => `${String(n)} ${n === 1 ? noun : `${noun}s`}`;
  const summary =
    total === 0
      ? `No ${noun}s yet`
      : RATINGS.filter((r) => counts[r] > 0)
          .map((r) => `${RATING_INFO[r].label}: ${plural(counts[r])}`)
          .join(", ");

  const present = RATINGS.filter((r) => counts[r] > 0);
  const shares = present.map((rating) => (counts[rating] / total) * 100);
  const arcs = present.map((rating, index) => ({
    rating,
    // Each arc starts where the ones before it end.
    offset: shares.slice(0, index).reduce((sum, share) => sum + share, 0),
    // A small gap after every arc but the last keeps neighbours apart.
    length: Math.max(0.5, (shares[index] ?? 0) - (index < present.length - 1 ? GAP : 0)),
  }));

  return (
    <div className="flex flex-col gap-3">
      <div className="relative mx-auto w-full max-w-60">
        <svg
          viewBox="0 0 200 110"
          role="img"
          aria-label={`${plural(total)} in total. ${summary}.`}
          className="w-full"
        >
          <path
            d={ARC}
            pathLength={100}
            fill="none"
            strokeWidth={20}
            className="stroke-surface-2"
          />
          {arcs.map(({ rating, offset, length }) => (
            <path
              key={rating}
              d={ARC}
              pathLength={100}
              fill="none"
              strokeWidth={20}
              strokeDasharray={`${String(length)} 100`}
              strokeDashoffset={-offset}
              className={RATING_INFO[rating].stroke}
            >
              <title>{`${RATING_INFO[rating].label}: ${plural(counts[rating])}`}</title>
            </path>
          ))}
        </svg>
        {center ? (
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 text-center">
            {center}
          </div>
        ) : null}
      </div>

      <ul aria-hidden="true" className="flex flex-col gap-1.5 text-xs">
        {RATINGS.map((rating) => {
          const info = RATING_INFO[rating];
          const count = counts[rating];
          return (
            <li key={rating} className="flex items-center gap-1.5">
              <span className={`size-2.5 shrink-0 rounded-full ${info.bar}`} />
              <span className="font-semibold">
                {info.emoji} {info.label}
              </span>
              <span className="ml-auto tabular-nums text-muted">
                {count}
                {total > 0 && ` · ${PERCENT.format(count / total)}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
