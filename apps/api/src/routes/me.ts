import { Hono } from "hono";
import { describeRoute } from "hono-openapi";

import { requireAuth } from "../middleware/auth.js";
import type { AppEnv } from "../types.js";

/** The signed-in user's own profile, including whether onboarding is finished. */
export const meRoutes = new Hono<AppEnv>().get(
  "/",
  describeRoute({
    tags: ["Members"],
    summary: "The signed-in member's profile and onboarding status",
    security: [{ session: [] }],
  }),
  requireAuth,
  (c) => {
    // requireAuth guarantees a user.
    const user = c.get("user");
    if (!user) throw new Error("unreachable");

    return c.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image ?? null,
        username: user.username ?? null,
        displayUsername: user.displayUsername ?? null,
        role: user.role ?? "user",
        createdAt: user.createdAt,
      },
      needsUsername: !user.username,
    });
  },
);
