import "server-only";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import type { Viewer } from "./types";

import { signInHref, verifySignInHref, welcomeHref } from "./safe-next";

/** The API, reached directly from the server (browsers go through the /api proxy). */
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";

/**
 * GETs public API data from the server, cached for `revalidate` seconds. Returns null
 * when the API is down or answers with an error, so a page can show a fallback
 * instead of crashing.
 */
export async function apiGet<T>(
  path: `/api/${string}`,
  revalidate = 60,
  tags: string[] = [],
): Promise<T | null> {
  return request<T>(path, { next: { revalidate, tags } });
}

/**
 * Cache tags, so a member's change shows up at once instead of when the cache
 * expires (see app/actions.ts).
 */
export const TAGS = {
  title: (mediaId: number | string) => `media:${String(mediaId)}`,
  /** Every title page at once, for changes that touch many titles (a deleted account). */
  allTitles: "media-all",
  mediaLists: "media-lists",
  reviews: "reviews",
  profile: (username: string) => `user:${username.toLowerCase()}`,
  club: "club-suggestions",
};

const SESSION_COOKIE = "amc.session_token";

/**
 * Like apiGet, but as the signed-in member, for data that differs per viewer (such as
 * whether they liked each review). Signed-in requests are never cached, so one
 * member's view can't be served to another; guests still get the cached version.
 */
export async function apiGetAsViewer<T>(
  path: `/api/${string}`,
  revalidate = 60,
  tags: string[] = [],
): Promise<T | null> {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader.includes(SESSION_COOKIE)) return apiGet<T>(path, revalidate, tags);
  return request<T>(path, { cache: "no-store", headers: { cookie: cookieHeader } });
}

async function request<T>(path: `/api/${string}`, init: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_ORIGIN}${path}`, {
      ...init,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      // A 4xx here is a bug in the page's request, so make it visible in the server log.
      console.warn(`API ${String(res.status)} for ${path}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`API unreachable for ${path}:`, err);
    return null;
  }
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  username: string | null;
  displayUsername: string | null;
  role: string;
}

type Session =
  | { state: "member"; user: CurrentUser }
  | { state: "guest" }
  // Signed in, but hasn't typed the code we emailed yet: signed out for everything else.
  | { state: "pending" }
  // Has a session cookie, but the API couldn't say whose (it's down or restarting).
  | { state: "unknown" };

// Cached per request: the header and the page both ask, but the API is called once.
const getSession = cache(async (): Promise<Session> => {
  const cookieHeader = (await cookies()).toString();
  // Guests have no session cookie, so skip the round trip.
  if (!cookieHeader.includes(SESSION_COOKIE)) return { state: "guest" };

  try {
    const res = await fetch(`${API_ORIGIN}/api/me`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    // 401: the session expired or was revoked, or is waiting for its sign-in code.
    if (res.status === 401) {
      const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
      return body?.error?.code === "SIGN_IN_CODE_REQUIRED"
        ? { state: "pending" }
        : { state: "guest" };
    }
    if (!res.ok) return { state: "unknown" };
    const body = (await res.json()) as { user: CurrentUser };
    return { state: "member", user: body.user };
  } catch {
    return { state: "unknown" };
  }
});

/**
 * The signed-in member for this request, or null. Never throws: if the API is
 * unreachable, public pages still render (just signed out).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  return session.state === "member" ? session.user : null;
}

/** True when someone signed in but hasn't entered their emailed code yet. */
export async function isSignInPending(): Promise<boolean> {
  return (await getSession()).state === "pending";
}

export interface SignInCodeStatus {
  email: string;
  sent: boolean;
  expiresAt?: string;
  resendAvailableAt?: string;
  canResend?: boolean;
  expired?: boolean;
}

/** Where the sign-in code went and when another can be sent, or null if none is waiting. */
export async function getSignInCodeStatus(): Promise<SignInCodeStatus | null> {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader.includes(SESSION_COOKIE)) return null;
  try {
    const res = await fetch(`${API_ORIGIN}/api/sign-in-code`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return res.ok ? ((await res.json()) as SignInCodeStatus) : null;
  } catch {
    return null;
  }
}

/** What review cards need to know about who's looking. */
export function viewerOf(user: CurrentUser | null): Viewer {
  return user ? { id: user.id, hasUsername: Boolean(user.username) } : null;
}

/**
 * For pages only signed-in members can see. Guests go to sign-in, and members who
 * haven't picked a username yet (new Google sign-ins) go to pick one; both come back
 * to `next` afterwards.
 */
export async function requireMember(next: string): Promise<CurrentUser> {
  const user = await requireSignedIn(next);
  if (!user.username) redirect(welcomeHref(next));
  return user;
}

/**
 * For club-lead pages. Everyone else gets a 404, so the page doesn't advertise itself;
 * the API checks the role again on every change.
 */
export async function requireAdmin(next: string): Promise<CurrentUser> {
  const user = await requireMember(next);
  if (user.role !== "admin") notFound();
  return user;
}

/** Like requireMember, but lets members without a username through (the welcome page). */
export async function requireSignedIn(next: string): Promise<CurrentUser> {
  const session = await getSession();
  if (session.state === "member") return session.user;
  // Don't send a signed-in member to the sign-in page just because the API hiccuped;
  // the error page offers "Try again" instead.
  if (session.state === "unknown") throw new Error("Couldn't check who's signed in.");
  if (session.state === "pending") redirect(verifySignInHref(next));
  redirect(signInHref(next));
}
