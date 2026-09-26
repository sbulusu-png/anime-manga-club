import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";

import type { Db } from "../db/client.js";
import { validate } from "../lib/validation.js";
import { getProfile } from "../services/users.js";
import type { AppEnv } from "../types.js";

const usernameParam = z.object({ username: z.string().trim().min(1).max(30) });

/** Public member profiles. Their reviews and lists come from /api/reviews and /api/list. */
export function userRoutes({ db }: { db: Db }) {
  return new Hono<AppEnv>().get(
    "/:username",
    describeRoute({
      tags: ["Members"],
      summary: "A member's public profile and stats (verdicts, list, favourite genres)",
    }),
    validate("param", usernameParam),
    async (c) => c.json(await getProfile(db, c.req.valid("param").username)),
  );
}
