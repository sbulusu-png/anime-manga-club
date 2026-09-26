/**
 * Members rate titles with a verdict rather than a number. The database stores each
 * verdict as 1–4 (in `reviews.score`), so averages, sorting and the club counters work
 * unchanged; the API only ever speaks in verdicts.
 */
export const RATINGS = ["skip", "timepass", "go_for_it", "perfection"] as const;
export type Rating = (typeof RATINGS)[number];

export const RATING_LABELS: Record<Rating, string> = {
  skip: "Skip",
  timepass: "Timepass",
  go_for_it: "Go for it",
  perfection: "Perfection",
};

export const RATING_MIN = 1;
export const RATING_MAX = RATINGS.length;

/** "go_for_it" → 3 */
export function ratingToValue(rating: Rating): number {
  return RATINGS.indexOf(rating) + 1;
}

/** 3 → "go_for_it". Averages round to the nearest verdict (2.5 rounds up). */
export function valueToRating(value: number): Rating {
  const index = Math.min(RATING_MAX, Math.max(RATING_MIN, Math.round(value))) - 1;
  return RATINGS[index] ?? "timepass";
}
