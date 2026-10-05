import type { CSSProperties } from "react";

import { CharacterRails } from "./character-rails";

/**
 * Fixed, decorative page backdrop: popular characters in the margins (wide screens),
 * colour glows, manga halftone dots, faint speed lines and a few drifting sakura petals.
 * CSS (see globals.css) apart from the characters' scroll drift; motion stops for reduced
 * motion. Sits behind everything and never takes clicks.
 */

// Fixed positions so server and browser render the same thing.
const PETALS = [
  { x: 6, delay: 0, duration: 19, size: 14, sway: 60 },
  { x: 18, delay: -7, duration: 23, size: 10, sway: -40 },
  { x: 31, delay: -13, duration: 21, size: 12, sway: 50 },
  { x: 47, delay: -3, duration: 26, size: 9, sway: -60 },
  { x: 62, delay: -17, duration: 20, size: 13, sway: 40 },
  { x: 74, delay: -9, duration: 24, size: 11, sway: -50 },
  { x: 86, delay: -21, duration: 22, size: 15, sway: 30 },
  { x: 95, delay: -5, duration: 27, size: 10, sway: -30 },
];

export function AnimeBackdrop() {
  return (
    <div aria-hidden="true" className="anime-backdrop">
      {/* Characters first, under the glows; their veil keeps the content column plain. */}
      <CharacterRails />
      <div className="anime-backdrop__glow" />
      <div className="anime-backdrop__speedlines" />
      <div className="anime-backdrop__halftone" />
      {PETALS.map((petal) => (
        <span
          key={petal.x}
          className="anime-backdrop__petal"
          style={
            {
              "--x": `${String(petal.x)}vw`,
              "--delay": `${String(petal.delay)}s`,
              "--duration": `${String(petal.duration)}s`,
              "--size": `${String(petal.size)}px`,
              "--sway": `${String(petal.sway)}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
