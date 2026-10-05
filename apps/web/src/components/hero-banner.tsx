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
    color: "#e63946",
    image: "https://s4.anilist.co/file/anilistcdn/character/large/b40-MNypXsxSRb1R.png",
  },
  {
    name: "Ichigo Kurosaki",
    color: "#ff8c1a",
    image: "https://s4.anilist.co/file/anilistcdn/character/large/b5-a7bkJgjhhigE.png",
  },
  {
    name: "Asta",
    color: "#2dbd6e",
    image: "https://s4.anilist.co/file/anilistcdn/character/large/b123285-tKijiuQErDS0.png",
  },
  {
    name: "Edward Elric",
    color: "#d4a017",
    image: "https://s4.anilist.co/file/anilistcdn/character/large/b11-TA5Nuk7EDUZG.jpg",
  },
  {
    name: "Conan Edogawa",
    color: "#2f6fed",
    image: "https://s4.anilist.co/file/anilistcdn/character/large/b1742-NiV278NBFOvZ.png",
  },
];

const TITLE = "ANIME MANGA CLUB";
/** One entry per character, each with a stable id, for the letter-by-letter entrance. */
const TITLE_LETTERS = Array.from(TITLE, (char, position) => ({ char, id: `letter-${position}` }));

/**
 * The home page banner: five slanted character panels that widen on hover, with the
 * club name on top. Panels slide in and the title drops in letter by letter, unless
 * the visitor prefers reduced motion.
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
              narrow ? { xPercent: -110, stagger: 0.08 } : { yPercent: 110, stagger: 0.09 },
              "panels",
            )
            .from(".banner-panel img", { scale: 1.3, stagger: 0.09, duration: 1.1 }, "panels")
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
      className="relative mx-auto mt-4 aspect-[4/5] w-[calc(100%-2rem)] max-w-6xl overflow-hidden rounded-3xl bg-[#0b0a10] shadow-card sm:aspect-[21/8] sm:min-h-80"
    >
      {/* Soft glow and speed lines behind the panels. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,#2a1f4d_0%,transparent_60%),repeating-linear-gradient(115deg,#ffffff06_0_2px,transparent_2px_14px)]"
      />

      <div className="absolute inset-0 flex flex-col gap-[3px] sm:-skew-x-[8deg] sm:flex-row sm:gap-1.5 sm:px-[3%]">
        {CHARACTERS.map((character) => (
          <div
            key={character.name}
            className="banner-panel group relative flex-1 overflow-hidden border-b-[6px] transition-[flex-grow] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] hover:flex-[1.8]"
            style={{
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
                className="object-cover object-[center_20%] opacity-90 mix-blend-luminosity transition-opacity duration-300 group-hover:opacity-100 group-hover:mix-blend-normal sm:object-top"
              />
            </div>
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,#0b0a10ee_100%)]"
            />
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center sm:top-auto sm:bottom-[5%] sm:translate-y-0">
        <h1
          id="banner-title"
          aria-label="Anime Manga Club"
          className="font-display text-[clamp(2.1rem,6.5vw,6rem)] leading-[0.9] tracking-[0.12em] text-[#f5f3ff] [paint-order:stroke_fill] [-webkit-text-stroke:2px_#000] [text-shadow:4px_4px_0_#e63946,8px_8px_0_#000]"
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
        <p className="banner-tagline mt-2 text-[clamp(0.65rem,1.1vw,0.95rem)] font-semibold uppercase tracking-[0.4em] text-[#a9a3c2]">
          Reviews · Suggestions · Debates
        </p>
      </div>
    </section>
  );
}
