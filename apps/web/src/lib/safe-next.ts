import type { Route } from "next";

/**
 * Where to send a member after signing in. Only paths on this site are allowed, so a
 * crafted ?next= link can't bounce someone to another website (an open redirect).
 */
export function safeNext(value: string | string[] | null | undefined, fallback = "/"): string {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next?.startsWith("/")) return fallback;
  // "//evil.com" and "/\evil.com" are treated as other hosts by browsers.
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  // Control characters (tabs and newlines are stripped by URL parsers) are never needed.
  for (let i = 0; i < next.length; i++) {
    const code = next.charCodeAt(i);
    if (code < 32 || code === 127) return fallback;
  }
  // Sending someone back to an auth page after signing in would loop.
  if (/^\/(sign-in|sign-up)(\/|\?|$)/.test(next)) return fallback;
  return next;
}

/** "/sign-in?next=/for-you", keeping only a safe next path. */
export function signInHref(next: string): Route {
  const safe = safeNext(next);
  return safe === "/" ? "/sign-in" : `/sign-in?next=${encodeURIComponent(safe)}`;
}

/** "/welcome?next=/for-you": where members without a username go to pick one. */
export function welcomeHref(next: string): Route {
  const safe = safeNext(next);
  return safe === "/" ? "/welcome" : `/welcome?next=${encodeURIComponent(safe)}`;
}
