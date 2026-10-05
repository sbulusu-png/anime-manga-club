import type { ReactNode } from "react";

/**
 * A heading styled like an anime title card: the title in the display font with a red
 * offset shadow and a brush stroke under it, over a big faint Japanese watermark
 * (`jp`, decorative and hidden from screen readers). See .anime-heading in globals.css.
 */
export function AnimeHeading({
  as: Tag = "h1",
  id,
  jp,
  className = "text-5xl sm:text-6xl",
  children,
}: {
  as?: "h1" | "h2";
  id?: string;
  jp: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="anime-heading">
      {/* The watermark is drawn by CSS from data-jp (::before), not page text: it's pure
          decoration, so it stays out of screen readers and out of contrast checks. */}
      <span
        aria-hidden="true"
        data-jp={jp}
        className={`anime-heading__jp font-display ${className}`}
      />
      <Tag id={id} className={`anime-heading__text font-display tracking-wide ${className}`}>
        {children}
      </Tag>
    </div>
  );
}
