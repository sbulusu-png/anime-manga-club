import { createMiddleware } from "hono/factory";

import type { Auth } from "../auth.js";
import { AppError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

/** Loads the signed-in user (or null) for every request. */
export function loadSession(auth: Auth) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const result = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("user", result?.user ?? null);
    c.set("session", result?.session ?? null);
    await next();
  });
}

/** 401 unless someone is signed in. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("user")) {
    throw new AppError(401, "UNAUTHENTICATED", "Please sign in first");
  }
  await next();
});

/** 403 until the user has picked a username (Google sign-ups start without one). */
export const requireUsername = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  if (!user) throw new AppError(401, "UNAUTHENTICATED", "Please sign in first");
  if (!user.username) {
    throw new AppError(403, "USERNAME_REQUIRED", "Choose a username before continuing");
  }
  await next();
});

/** 403 unless the signed-in user has the given role (read fresh from the database). */
export function requireRole(role: "admin") {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user) throw new AppError(401, "UNAUTHENTICATED", "Please sign in first");
    if (user.role !== role) {
      throw new AppError(403, "FORBIDDEN", "You don't have permission to do that");
    }
    await next();
  });
}
