import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";

import type { Db } from "../db/client.js";
import { validate } from "../lib/validation.js";
import { requireAuth } from "../middleware/auth.js";
import { recommendFor, toRecommendationJson } from "../services/recommendations.js";
import type { AppEnv } from "../types.js";

const query = z.object({
  type: z.enum(["anime", "manga"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** "For you": personal recommendations with the reasons for each. */
export function recommendationRoutes({ db }: { db: Db }) {
  return new Hono<AppEnv>().get(
    "/",
    describeRoute({
      tags: ["Suggestions"],
      summary: "Personal recommendations, each with the reasons for it",
      security: [{ session: [] }],
    }),
    requireAuth,
    validate("query", query),
    async (c) => {
      const userId = c.get("user")?.id ?? "";
      const { items, basedOn } = await recommendFor(db, userId, c.req.valid("query"));
      return c.json({ items: items.map(toRecommendationJson), basedOn });
    },
  );
}
