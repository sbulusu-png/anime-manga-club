"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import Image from "next/image";
import { useRef } from "react";

gsap.registerPlugin(useGSAP);

/** The club's five mascots (art from AniList, credited on /credits). */
const CHARACTERS = [
  {
    name: "Monkey D. Luffy",
    short: "Luffy",
    area: "lead",
    // Phones: where to aim the crop so the whole face shows (x% y% of the picture).
    focus: "50% 30%",
    color: "#e63946",
    image: "https://s4.anilist.co/file/anilistcdn/character/large/b40-MNypXsxSRb1R.png",
  },
  {
    name: "Ichigo Kurosaki",
    short: "Ichigo",
    area: "upper",
    focus: "60% 42%",
    color: "#ff8c1a",
    image: "https://s4.anilist.co/file/anilistcdn/character/large/b5-a7bkJgjhhigE.png",
  },
  {
    name: "Asta",
    short: "Asta",
    area: "middle",
    focus: "50% 42%",
    color: "#2dbd6e",
    image: "https://s4.anilist.co/file/anilistcdn/character/large/b123285-tKijiuQErDS0.png",
  },
  {
    name: "Edward Elric",
    short: "Edward",
    area: "left",
    focus: "50% 24%",
    color: "#d4a017",
    image: "https://s4.anilist.co/file/anilistcdn/character/large/b11-TA5Nuk7EDUZG.jpg",
  },
  {
    name: "Conan Edogawa",
    short: "Conan",
    area: "right",
    focus: "50% 11%",
    color: "#2f6fed",
    image: "https://s4.anilist.co/file/anilistcdn/character/large/b1742-NiV278NBFOvZ.png",
  },
];

const TITLE = "ANIME MANGA CLUB";
/** One entry per character, each with a stable id, for the letter-by-letter entrance. */
const TITLE_LETTERS = Array.from(TITLE, (char, position) => ({ char, id: `letter-${position}` }));

/**
 * The home page banner. Wide screens: five slanted character panels that widen on
 * hover, with the club name across the bottom. Phones: a manga page, the club name as
 * a masthead over a panel grid (Luffy in the tall lead panel), each character named in
 * a caption box. Same five images either way. Panels arrive first, then the title drops
 * in letter by letter, unless the visitor prefers reduced motion.
 */
export function HeroBanner() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
          narrow: "(max-width: 639px)",
        },
        (context) => {
          const { motion, narrow } = context.conditions ?? {};
          if (!motion) return;
          gsap
            .timeline({ defaults: { duration: 0.7, ease: "power3.out" } })
            .addLabel("panels")
            .from(
              ".banner-panel",
              // Phones: panels pop in like a page being inked; wide: they rise into place.
              narrow
                ? { scale: 0.85, autoAlpha: 0, stagger: 0.08, ease: "back.out(1.6)" }
                : { yPercent: 110, stagger: 0.09 },
              "panels",
            )
            .from(".banner-panel img", { scale: 1.3, stagger: 0.09, duration: 1.1 }, "panels")
            .from(".banner-caption", { autoAlpha: 0, y: 8, stagger: 0.06, duration: 0.4 }, "-=0.5")
            .addLabel("title", "-=0.3")
            .from(
              ".banner-letter",
              {
                yPercent: 120,
                rotate: -15,
                autoAlpha: 0,
                stagger: 0.04,
                ease: "back.out(2.5)",
              },
              "title",
            )
            .from(
              ".banner-tagline",
              // Transform and opacity only: animating letter-spacing would re-run layout.
              { autoAlpha: 0, y: 12, duration: 0.6 },
              "<0.3",
            );
        },
      );
    },
    { scope: rootRef },
  );

  return (
    <section
      ref={rootRef}
      aria-labelledby="banner-title"
      className="relative mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-6xl flex-col overflow-hidden rounded-3xl bg-[#0b0a10] shadow-card sm:block sm:aspect-[21/8] sm:min-h-80"
    >
      {/* Soft glow and speed lines behind the panels. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,#2a1f4d_0%,transparent_60%),repeating-linear-gradient(115deg,#ffffff06_0_2px,transparent_2px_14px)]"
      />

      {/* Phones: a manga panel grid (areas below). Wide screens: slanted panels in a row. */}
      <div className="relative grid h-[clamp(27rem,112vw,32rem)] grid-cols-[1.15fr_1fr] grid-rows-3 gap-1.5 px-1.5 pb-1.5 [grid-template-areas:'lead_upper'_'lead_middle'_'left_right'] sm:absolute sm:inset-0 sm:flex sm:h-auto sm:-skew-x-[8deg] sm:flex-row sm:gap-1.5 sm:p-0 sm:px-[3%]">
        {CHARACTERS.map((character) => (
          <div
            key={character.name}
            className="banner-panel group relative overflow-hidden rounded-md border-b-[5px] transition-[flex-grow] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] sm:flex-1 sm:rounded-none sm:border-b-[6px] sm:hover:flex-[1.8]"
            style={{
              gridArea: character.area,
              // Where phones crop each picture (wide screens crop from the top).
              ["--focus" as string]: character.focus,
              borderColor: character.color,
              background: `linear-gradient(180deg, transparent 40%, color-mix(in srgb, ${character.color} 45%, transparent))`,
            }}
          >
            {/* Wider than the panel and un-skewed, so the slant crops the art instead of distorting it. */}
            <div className="absolute inset-0 sm:inset-x-[-30%] sm:skew-x-[8deg]">
              <Image
                src={character.image}
                alt={character.name}
                fill
                priority
                sizes="(max-width: 639px) 100vw, 40vw"
                className="object-cover object-[var(--focus)] sm:object-top sm:opacity-90 sm:mix-blend-luminosity sm:transition-opacity sm:duration-300 sm:group-hover:opacity-100 sm:group-hover:mix-blend-normal"
              />
            </div>
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[linear-gradient(180deg,transparent_72%,#0b0a10bb_100%)] sm:bg-[linear-gradient(180deg,transparent_55%,#0b0a10ee_100%)]"
            />
            {/* Phones: a manga caption box naming who's in the panel. */}
            <span
              aria-hidden="true"
              className="banner-caption absolute bottom-1.5 left-1.5 rounded-sm border-2 border-black bg-[#f5f3ff] px-1.5 py-0.5 font-display text-sm leading-none tracking-wide text-black sm:hidden"
            >
              {character.short}
            </span>
          </div>
        ))}
      </div>

      {/* Phones: a masthead above the panels. Wide screens: across the panels' feet. */}
      <div className="pointer-events-none relative order-first px-4 pb-3 pt-5 text-center sm:absolute sm:inset-x-0 sm:bottom-[5%] sm:p-0">
        <h1
          id="banner-title"
          aria-label="Anime Manga Club"
          className="font-display text-[clamp(2.2rem,11vw,6rem)] leading-[0.9] tracking-[0.06em] sm:text-[clamp(2.1rem,6.5vw,6rem)] sm:tracking-[0.12em] text-[#f5f3ff] [paint-order:stroke_fill] [-webkit-text-stroke:2px_#000] [text-shadow:4px_4px_0_#e63946,8px_8px_0_#000]"
        >
          {TITLE_LETTERS.map(({ char, id }) =>
            char === " " ? (
              " "
            ) : (
              <span key={id} aria-hidden="true" className="banner-letter inline-block">
                {char}
              </span>
            ),
          )}
        </h1>
        <p className="banner-tagline mt-2 text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#a9a3c2] sm:text-[clamp(0.65rem,1.1vw,0.95rem)] sm:tracking-[0.4em]">
          Reviews · Suggestions · Debates
        </p>
      </div>
    </section>
  );
}
