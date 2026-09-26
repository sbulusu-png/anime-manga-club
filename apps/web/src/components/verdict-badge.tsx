import { RATING_INFO, type Rating } from "@/lib/rating";

/** A dot in the verdict's gauge colour, so each verdict reads the same everywhere. */
export function VerdictDot({
  rating,
  className = "size-2.5",
}: {
  rating: Rating;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full ${RATING_INFO[rating].bar} ${className}`}
    />
  );
}

/** "● Perfection", coloured for its verdict. */
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
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-bold ${info.soft} ${info.text} ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
      } ${className}`}
    >
      <VerdictDot rating={rating} className={size === "sm" ? "size-2" : "size-2.5"} />
      {info.label}
    </span>
  );
}
