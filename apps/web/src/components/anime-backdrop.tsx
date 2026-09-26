import type { CSSProperties } from "react";

/**
 * Fixed, decorative page backdrop: colour glows, manga halftone dots, faint speed lines
 * and a few drifting sakura petals. Pure CSS (see globals.css), no JavaScript; petals are
 * hidden for reduced motion. Sits behind everything and never takes clicks.
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
