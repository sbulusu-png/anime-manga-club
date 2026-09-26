"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { useHasMounted, useReducedMotion } from "@/lib/use-reduced-motion";

/** Shown until three.js and the model load (and during server rendering). */
function Placeholder() {
  return (
    <span aria-hidden="true" className="grid size-full place-items-center text-xl">
      <span className="size-5 rounded-full bg-accent/70 shadow-[0_0_12px] shadow-accent/60" />
    </span>
  );
}

const AnyaScene = dynamic(() => import("./anya-scene"), { ssr: false, loading: Placeholder });

/**
 * three.js is the heaviest thing on the page, so Anya waits until the page has loaded
 * and the browser is idle (or until someone reaches for the toggle). That keeps the
 * banner and content fast on phones.
 */
function useLoadWhenIdle() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      if ("requestIdleCallback" in window) {
        idle = window.requestIdleCallback(
          () => {
            setReady(true);
          },
          { timeout: 4000 },
        );
      } else {
        timer = setTimeout(() => {
          setReady(true);
        }, 1500);
      }
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      window.removeEventListener("load", start);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      clearTimeout(timer);
    };
  }, []);

  return [
    ready,
    () => {
      setReady(true);
    },
  ] as const;
}

/** The club's theme switch: Anya Forger, spinning in 3D. Click her to flip light/dark. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useHasMounted();
  const reducedMotion = useReducedMotion();
  const [spins, setSpins] = useState(0);
  const [ready, loadNow] = useLoadWhenIdle();

  const isDark = resolvedTheme === "dark";
  const label = !mounted
    ? "Switch theme"
    : isDark
      ? "Switch to light theme"
      : "Switch to dark theme";

  return (
    <button
      type="button"
      onClick={() => {
        setTheme(isDark ? "light" : "dark");
        setSpins((n) => n + 1);
      }}
      onPointerEnter={loadNow}
      onFocus={loadNow}
      aria-label={label}
      title={label}
      className="relative size-14 shrink-0 overflow-hidden rounded-full border-2 border-accent/60 bg-[radial-gradient(circle,var(--accent-soft),transparent_70%)] transition-transform hover:scale-105 active:scale-95"
    >
      {mounted && ready ? (
        <AnyaScene spins={spins} reducedMotion={reducedMotion} />
      ) : (
        <Placeholder />
      )}
    </button>
  );
}
