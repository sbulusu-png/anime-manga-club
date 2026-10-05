"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type ReactNode, useRef } from "react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * Fades and lifts each `.reveal-item` inside it as it scrolls into view. Items entering
 * together animate as one staggered batch, once. Nothing moves for visitors who prefer
 * reduced motion, and without JavaScript everything is simply visible.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
        const items = gsap.utils.toArray<HTMLElement>(".reveal-item", rootRef.current);
        gsap.set(items, { autoAlpha: 0, y: 32 });
        ScrollTrigger.batch(items, {
          start: "top 90%",
          once: true,
          // Deliberately not wrapped in contextSafe: for cards already on screen this
          // fires immediately, inside the matchMedia context, and contextSafe there nests
          // the contexts in a loop ("Maximum call stack size exceeded" when the page is
          // left). These are short one-off fades on elements that unmount with the page.
          onEnter: (batch) =>
            gsap.to(batch, {
              autoAlpha: 1,
              y: 0,
              duration: 0.6,
              ease: "power3.out",
              stagger: 0.07,
              overwrite: true,
            }),
        });
      });
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className={className}>
      {children}
    </div>
  );
}
