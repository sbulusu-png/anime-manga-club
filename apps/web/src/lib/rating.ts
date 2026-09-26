/** The four verdicts members give titles (mirrors apps/api/src/lib/rating.ts). */
export const RATINGS = ["skip", "timepass", "go_for_it", "perfection"] as const;
export type Rating = (typeof RATINGS)[number];

export const RATING_INFO: Record<
  Rating,
  {
    label: string;
    blurb: string;
    text: string;
    soft: string;
    /** Fill in the gauge colour: legend and verdict dots. */
    bar: string;
    stroke: string;
  }
> = {
  skip: {
    label: "Skip",
    blurb: "Not worth your time",
    text: "text-verdict-skip",
    soft: "bg-verdict-skip-soft",
    bar: "bg-verdict-skip",
    stroke: "stroke-verdict-skip",
  },
  timepass: {
    label: "Timepass",
    blurb: "Fine if you've nothing else on",
    text: "text-verdict-timepass",
    soft: "bg-verdict-timepass-soft",
    bar: "bg-verdict-timepass",
    stroke: "stroke-verdict-timepass",
  },
  go_for_it: {
    label: "Go for it",
    blurb: "Worth watching or reading",
    text: "text-verdict-go",
    soft: "bg-verdict-go-soft",
    bar: "bg-verdict-go",
    stroke: "stroke-verdict-go",
  },
  perfection: {
    label: "Perfection",
    blurb: "An all-time favourite",
    text: "text-verdict-perfect",
    soft: "bg-verdict-perfect-soft",
    bar: "bg-verdict-perfect",
    stroke: "stroke-verdict-perfect",
  },
};
