"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import Image from "next/image";
import { useRef } from "react";

gsap.registerPlugin(useGSAP);

const CDN = "https://s4.anilist.co/file/anilistcdn/character/large";

// Some of AniList's most-favourited characters (the banner already has Luffy, Ichigo,
// Asta, Edward and Conan). Artwork via AniList; see /credits.
const LEFT = [
  `${CDN}/b127691-9zqh1xpIubn7.png`, // Satoru Gojo
  `${CDN}/b40881-F3gr1PkreDvj.png`, // Mikasa Ackerman
  `${CDN}/b417-gVLmIJu9phcK.png`, // Lelouch Lamperouge
  `${CDN}/b176754-PCnpqIOkjhFk.png`, // Frieren
  `${CDN}/b14-9Kb1E5oel1ke.png`, // Itachi Uchiha
  `${CDN}/b126071-BTNEc1nRIv68.png`, // Tanjiro Kamado
  `${CDN}/b40882-dsj7IP943WFF.jpg`, // Eren Yeager
  `${CDN}/b34470-Jw2LXZBL5R8i.png`, // Kurisu Makise
  `${CDN}/b127212-FVm2tD0erQ5B.png`, // Yuji Itadori
  `${CDN}/b85-mkVBh2yjxjmx.png`, // Kakashi Hatake
  `${CDN}/b90169-4wr1Zehnsac8.png`, // Violet Evergarden
  `${CDN}/b89616-dXmdOc7L6SDi.png`, // Shigeo "Mob" Kageyama
  `${CDN}/b89361-tq8PQQ4MmF0M.png`, // Megumin
];
const RIGHT = [
  `${CDN}/b27-Z5O02kQUydpT.jpg`, // Killua Zoldyck
  `${CDN}/b137080-UHcynYNjb5ZU.png`, // Makima
  `${CDN}/b62-S7oAeA9WInjV.png`, // Zoro Roronoa
  `${CDN}/b126824-MqsCncTO1qpv.png`, // Maomao
  `${CDN}/b17-phjcWCkRuIhu.png`, // Naruto Uzumaki
  `${CDN}/b71-1W4panC53vfs.png`, // L Lawliet
  `${CDN}/b87275-mb13EWZBdbh3.png`, // Ken Kaneki
  `${CDN}/b10138-zOPrka0ddZOR.png`, // Thorfinn
  `${CDN}/b130102-FO1VHNnEnLlB.png`, // Denji
  `${CDN}/b137079-6yLEUYR3bmpr.png`, // Power
  `${CDN}/b80-26EhwSsSqQ50.png`, // Light Yagami
  `${CDN}/b89220-KNBwaVFAR8FD.png`, // Shoto Todoroki
  `${CDN}/b28-ivA7UGnfE40a.png`, // Kurapika
];

function Rail({ side, images }: { side: "left" | "right"; images: string[] }) {
  // Drawn twice, so the track can loop forever: when it has moved by one full set, the
  // second set sits exactly where the first began.
  const panels = [...images, ...images];
  return (
    <div className={`character-rail character-rail--${side}`}>
      <div className="character-rail__track">
        {panels.map((src, i) => (
          <div
            key={`${src}-${String(i)}`}
            className="character-rail__panel"
            style={{ rotate: `${String((i % 2 === 0 ? -1 : 1) * (side === "left" ? 3 : -3))}deg` }}
          >
            <Image src={src} alt="" fill sizes="176px" className="object-cover object-top" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** How far the characters drift for each pixel scrolled. */
const DRIFT = 0.4;

/**
 * Popular characters in the page margins, behind everything (see .character-rail in
 * globals.css). Wide screens only. They drift up at a steady fraction of the scroll, on
 * an endless loop, so a page growing (Browse loading more) or changing never pulls them
 * backward; motion stops for reduced motion.
 */
export function CharacterRails() {
  const rootRef = useRef<HTMLDivElement>(null);
  // Where the drift has got to, carried across pages.
  const offsetRef = useRef({ base: 0, lastScroll: 0 });

  useGSAP(
    () => {
      // Created inside useGSAP, so it is reverted on unmount with everything else.
      gsap
        .matchMedia()
        .add("(min-width: 1280px) and (prefers-reduced-motion: no-preference)", () => {
          const movers = gsap.utils.toArray<HTMLElement>(".character-rail__track").map((track) => {
            // One set of characters (the track holds two); wrapping within it is seamless.
            const loop = () => track.scrollHeight / 2;
            const wrap = (y: number) => gsap.utils.wrap(-loop(), 0, y);
            // quickTo reuses one tween for a value that changes on every scroll event.
            return gsap.quickTo(track, "y", {
              duration: 0.8,
              ease: "power3",
              modifiers: { y: (y: string) => `${String(wrap(parseFloat(y)))}px` },
            });
          });
          const update = () => {
            const o = offsetRef.current;
            // A jump of over a screen in one go isn't someone scrolling: it's a new
            // page starting at the top (Next.js moves the scroll before the URL changes),
            // Home/End or a link to an anchor. Fold it into the base, so the characters
            // stay where they are instead of rewinding or racing ahead.
            if (Math.abs(window.scrollY - o.lastScroll) > window.innerHeight) {
              o.base += (o.lastScroll - window.scrollY) * DRIFT;
            }
            o.lastScroll = window.scrollY;
            const y = -(o.base + window.scrollY * DRIFT);
            for (const move of movers) move(y);
          };
          update();
          window.addEventListener("scroll", update, { passive: true });
          return () => {
            window.removeEventListener("scroll", update);
          };
        });
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className="character-rails">
      <Rail side="left" images={LEFT} />
      <Rail side="right" images={RIGHT} />
      <div className="character-rails__veil" />
    </div>
  );
}
