import { Hono } from "hono";
import { describeRoute } from "hono-openapi";

import type { Auth } from "../auth.js";
import type { AppEnv } from "../types.js";

/**
 * Development-only helpers, never mounted in production. Until the web app exists,
 * GET /api/dev/google starts Google sign-in from a plain link: it sets the OAuth
 * state cookie in this browser and redirects to Google.
 */
export function devRoutes(auth: Auth) {
  return new Hono<AppEnv>().get("/google", describeRoute({ hide: true }), async (c) => {
    const started = await auth.api.signInSocial({
      body: { provider: "google", callbackURL: "/api/me" },
      headers: c.req.raw.headers,
      asResponse: true,
    });
    const { url } = (await started.json()) as { url: string };

    const res = c.redirect(url, 302);
    for (const cookie of started.headers.getSetCookie()) {
      res.headers.append("Set-Cookie", cookie);
    }
    return res;
  });
}
