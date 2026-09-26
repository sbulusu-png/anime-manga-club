/** The four verdicts members give titles (mirrors apps/api/src/lib/rating.ts). */
export const RATINGS = ["skip", "timepass", "go_for_it", "perfection"] as const;
export type Rating = (typeof RATINGS)[number];

export const RATING_INFO: Record<
  Rating,
  {
    label: string;
    emoji: string;
    blurb: string;
    text: string;
    soft: string;
    bar: string;
    stroke: string;
  }
> = {
  skip: {
    label: "Skip",
    emoji: "🙅",
    blurb: "Not worth your time",
    text: "text-verdict-skip",
    soft: "bg-verdict-skip-soft",
    bar: "bg-verdict-skip",
    stroke: "stroke-verdict-skip",
  },
  timepass: {
    label: "Timepass",
    emoji: "🍿",
    blurb: "Fine if you've nothing else on",
    text: "text-verdict-timepass",
    soft: "bg-verdict-timepass-soft",
    bar: "bg-verdict-timepass",
    stroke: "stroke-verdict-timepass",
  },
  go_for_it: {
    label: "Go for it",
    emoji: "👍",
    blurb: "Worth watching or reading",
    text: "text-verdict-go",
    soft: "bg-verdict-go-soft",
    bar: "bg-verdict-go",
    stroke: "stroke-verdict-go",
  },
  perfection: {
    label: "Perfection",
    emoji: "💎",
    blurb: "An all-time favourite",
    text: "text-verdict-perfect",
    soft: "bg-verdict-perfect-soft",
    bar: "bg-verdict-perfect",
    stroke: "stroke-verdict-perfect",
  },
};
