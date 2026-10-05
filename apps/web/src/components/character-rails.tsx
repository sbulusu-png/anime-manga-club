"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

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
  return (
    <div className={`character-rail character-rail--${side}`}>
      <div className="character-rail__track">
        {images.map((src, i) => (
          <div
            key={src}
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

/**
 * Popular characters in the page margins, behind everything (see .character-rail in
 * globals.css). Wide screens only; the tracks drift up together as the page scrolls,
 * unless the visitor prefers reduced motion.
 */
export function CharacterRails() {
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useGSAP(
    () => {
      // Created inside useGSAP, so it is reverted on unmount with everything else.
      gsap
        .matchMedia()
        .add("(min-width: 1280px) and (prefers-reduced-motion: no-preference)", () => {
          // How far a track can move: its height beyond the viewport.
          const travel = (track: Element) => Math.max(0, track.scrollHeight - window.innerHeight);
          // Both rails drift up together at the same pace, over the whole page. (Moving
          // one against the scroll made that side look much faster than the other.)
          gsap.utils.toArray<HTMLElement>(".character-rail__track").forEach((track) => {
            gsap.to(track, {
              y: () => -travel(track),
              ease: "none",
              scrollTrigger: { start: 0, end: "max", scrub: 1.2, invalidateOnRefresh: true },
            });
          });
        });
    },
    { scope: rootRef },
  );

  // Each page has its own height, so the scroll range changes on navigation, and again
  // whenever a page grows (Browse loading more results): re-measure, so the rails keep
  // drifting all the way to the bottom.
  useEffect(() => {
    ScrollTrigger.refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        ScrollTrigger.refresh();
      }, 200);
    });
    observer.observe(document.body);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [pathname]);

  return (
    <div ref={rootRef} className="character-rails">
      <Rail side="left" images={LEFT} />
      <Rail side="right" images={RIGHT} />
      <div className="character-rails__veil" />
    </div>
  );
}
