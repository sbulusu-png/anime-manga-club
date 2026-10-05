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
    (_context, contextSafe) => {
      // Batches arrive after this hook has run; contextSafe keeps their tweens in the
      // context, so they're cleaned up on unmount like everything else.
      const reveal = contextSafe?.((batch: Element[]) =>
        gsap.to(batch, {
          autoAlpha: 1,
          y: 0,
          duration: 0.6,
          ease: "power3.out",
          stagger: 0.07,
          overwrite: true,
        }),
      );
      gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
        const items = gsap.utils.toArray<HTMLElement>(".reveal-item", rootRef.current);
        gsap.set(items, { autoAlpha: 0, y: 32 });
        ScrollTrigger.batch(items, {
          start: "top 90%",
          once: true,
          onEnter: (batch) => reveal?.(batch),
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
