/**
 * Light/dark theme with no script in the page. The site follows the device's setting
 * through CSS (light-dark() and prefers-color-scheme in globals.css). A member's own
 * choice is kept in a cookie, which the server reads to put .light or .dark on <html>, so
 * the page arrives in the right theme with nothing to run first.
 */
export const THEME_COOKIE = "theme";
export type Theme = "light" | "dark";

export const isTheme = (value: unknown): value is Theme => value === "light" || value === "dark";

/** Saves and applies a theme, without animating every colour on the page as it changes. */
export function applyTheme(theme: Theme) {
  // A year; SameSite=Lax like the session cookie. Not secret, so readable by scripts.
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
  const pause = document.createElement("style");
  pause.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.append(pause);
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  // Let the new colours paint, then bring transitions back.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      pause.remove();
    });
  });
}
