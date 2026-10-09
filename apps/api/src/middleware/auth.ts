import { createMiddleware } from "hono/factory";

import type { Auth } from "../auth.js";
import { AppError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

/**
 * Loads the signed-in user (or null) for every request. A sign-in still waiting for its
 * emailed code counts as signed out everywhere, except the routes that take the code.
 */
export function loadSession(auth: Auth) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const result = await auth.api.getSession({ headers: c.req.raw.headers });
    const verified = Boolean(result?.session.signInCodeVerifiedAt);
    c.set("user", verified ? (result?.user ?? null) : null);
    c.set("session", verified ? (result?.session ?? null) : null);
    c.set("pendingSession", result && !verified ? result : null);
    await next();
  });
}

/** 401 unless someone is signed in (and has entered their sign-in code). */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("user")) throw notSignedIn(c.get("pendingSession"));
  await next();
});

/** Tells the website whether to ask for the sign-in code or the password. */
function notSignedIn(pending: AppEnv["Variables"]["pendingSession"]) {
  return pending
    ? new AppError(
        401,
        "SIGN_IN_CODE_REQUIRED",
        "Enter the code we emailed you to finish signing in.",
      )
    : new AppError(401, "UNAUTHENTICATED", "Please sign in first");
}

/** 403 until the user has picked a username (Google sign-ups start without one). */
export const requireUsername = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  if (!user) throw notSignedIn(c.get("pendingSession"));
  if (!user.username) {
    throw new AppError(403, "USERNAME_REQUIRED", "Choose a username before continuing");
  }
  await next();
});

/** 403 unless the signed-in user has the given role (read fresh from the database). */
export function requireRole(role: "admin") {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user) throw notSignedIn(c.get("pendingSession"));
    if (user.role !== role) {
      throw new AppError(403, "FORBIDDEN", "You don't have permission to do that");
    }
    await next();
  });
}
