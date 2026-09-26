import { RATING_INFO, type Rating } from "@/lib/rating";

/** "💎 Perfection", coloured for its verdict. `compact` drops the emoji for tight spots. */
export function VerdictBadge({
  rating,
  size = "md",
  className = "",
}: {
  rating: Rating;
  size?: "sm" | "md";
  className?: string;
}) {
  const info = RATING_INFO[rating];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-bold ${info.soft} ${info.text} ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
      } ${className}`}
    >
      <span aria-hidden="true">{info.emoji}</span>
      {info.label}
    </span>
  );
}
