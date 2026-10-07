"use client";

import { useSyncExternalStore } from "react";

import { applyTheme } from "@/lib/theme";

const DARK_DEVICE = "(prefers-color-scheme: dark)";

/** Re-checks when the theme class changes or the device switches light/dark. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  const media = window.matchMedia(DARK_DEVICE);
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

/** Dark if the member chose it, or hasn't chosen and the device is dark. */
function isDarkNow() {
  const root = document.documentElement.classList;
  if (root.contains("dark")) return true;
  if (root.contains("light")) return false;
  return window.matchMedia(DARK_DEVICE).matches;
}

/** Light/dark switch: shows the moon in light mode and the sun in dark mode. */
export function ThemeToggle() {
  // null on the server: the device's setting is only known in the browser.
  const isDark = useSyncExternalStore<boolean | null>(subscribe, isDarkNow, () => null);
  const label =
    isDark === null ? "Switch theme" : isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(isDarkNow() ? "light" : "dark");
      }}
      aria-label={label}
      title={label}
      className="grid size-10 shrink-0 place-items-center rounded-full border border-border text-ink hover:bg-surface-2"
    >
      {/* Both icons are drawn; CSS shows the right one, so nothing flashes on load. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5 dark:hidden"
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="hidden size-5 dark:block"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  );
}
