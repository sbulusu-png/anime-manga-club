import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";

import type { Db } from "../db/client.js";
import { RATINGS } from "../lib/rating.js";
import { validate } from "../lib/validation.js";
import { requireAuth, requireUsername } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import {
  REVIEW_PERIODS,
  REVIEW_SORTS,
  createReview,
  deleteReview,
  getMyReview,
  getReview,
  listReviews,
  setLike,
  toReviewJson,
  updateReview,
} from "../services/reviews.js";
import type { AppEnv } from "../types.js";

export const REVIEW_BODY_MIN = 10;
export const REVIEW_BODY_MAX = 10_000;

/**
 * Normalises review text: Unix line endings, no invisible control characters,
 * at most one blank line in a row, no surrounding whitespace. Length is checked
 * after cleaning so padding can't sneak a too-short review through.
 */
export function cleanReviewBody(body: string): string {
  return (
    body
      .replace(/\r\n?/g, "\n")
      // Deliberately matches control and zero-width characters: removing them is the point.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\uFEFF]/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

const bodySchema = z
  .string()
  .max(REVIEW_BODY_MAX * 2) // reject absurd payloads before cleaning
  .transform(cleanReviewBody)
  .pipe(
    z
      .string()
      .min(REVIEW_BODY_MIN, `must be at least ${REVIEW_BODY_MIN} characters`)
      .max(REVIEW_BODY_MAX, `must be at most ${REVIEW_BODY_MAX} characters`),
  );
const ratingSchema = z.enum(RATINGS);
const mediaIdSchema = z.coerce.number().int().positive().max(2_147_483_647);

const createBody = z.strictObject({
  mediaId: mediaIdSchema,
  rating: ratingSchema,
  body: bodySchema,
  hasSpoilers: z.boolean().default(false),
});

const updateBody = z
  .strictObject({
    rating: ratingSchema.optional(),
    body: bodySchema.optional(),
    hasSpoilers: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, "send at least one field to change");

const listQuery = z.object({
  mediaId: mediaIdSchema.optional(),
  user: z.string().trim().min(1).max(30).optional(),
  sort: z.enum(REVIEW_SORTS).default("recent"),
  period: z.enum(REVIEW_PERIODS).default("all"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(300).optional(),
});

const idParam = z.object({ id: z.uuid() });

interface ReviewRouteDeps {
  db: Db;
  isTrustedProxy: (ip: string) => boolean;
}

export function reviewRoutes({ db, isTrustedProxy }: ReviewRouteDeps) {
  // Writes are limited per account (not per IP), so a shared network isn't penalised.
  const writeLimit = rateLimit({
    name: "review-writes",
    windowMs: 60_000,
    max: 30,
    isTrustedProxy,
    keyBy: (c) => c.get("user")?.id,
  });

  return (
    new Hono<AppEnv>()
      // Public feed: filter by title or author; newest first or most liked.
      .get(
        "/",
        describeRoute({
          tags: ["Reviews"],
          summary: "Review feed: filter by title or author, newest or most liked",
        }),
        validate("query", listQuery),
        async (c) => {
          const { user, ...query } = c.req.valid("query");
          const { items, nextCursor } = await listReviews(db, {
            ...query,
            username: user,
            viewerId: c.get("user")?.id,
          });
          return c.json({ items: items.map(toReviewJson), nextCursor });
        },
      )

      .get(
        "/mine",
        describeRoute({
          tags: ["Reviews"],
          summary: "The signed-in member's review of a title, if any",
          security: [{ session: [] }],
        }),
        requireAuth,
        validate("query", z.object({ mediaId: mediaIdSchema })),
        async (c) => {
          const userId = c.get("user")?.id ?? "";
          const row = await getMyReview(db, userId, c.req.valid("query").mediaId);
          return c.json({ item: row ? toReviewJson(row) : null });
        },
      )

      .get(
        "/:id",
        describeRoute({ tags: ["Reviews"], summary: "One review" }),
        validate("param", idParam),
        async (c) => {
          const row = await getReview(db, c.req.valid("param").id, c.get("user")?.id);
          return c.json({ item: toReviewJson(row) });
        },
      )

      .post(
        "/",
        describeRoute({
          tags: ["Reviews"],
          summary: "Write a review (one per title)",
          security: [{ session: [] }],
        }),
        requireUsername,
        writeLimit,
        validate("json", createBody),
        async (c) => {
          const { mediaId, ...input } = c.req.valid("json");
          const row = await createReview(db, c.get("user")?.id ?? "", mediaId, input);
          return c.json({ item: toReviewJson(row) }, 201);
        },
      )

      .patch(
        "/:id",
        describeRoute({
          tags: ["Reviews"],
          summary: "Edit your review",
          security: [{ session: [] }],
        }),
        requireUsername,
        writeLimit,
        validate("param", idParam),
        validate("json", updateBody),
        async (c) => {
          const patch = Object.fromEntries(
            Object.entries(c.req.valid("json")).filter(([, value]) => value !== undefined),
          );
          const row = await updateReview(
            db,
            c.get("user")?.id ?? "",
            c.req.valid("param").id,
            patch,
          );
          return c.json({ item: toReviewJson(row) });
        },
      )

      .delete(
        "/:id",
        describeRoute({
          tags: ["Reviews"],
          summary: "Delete your review (admins can delete any)",
          security: [{ session: [] }],
        }),
        requireAuth,
        writeLimit,
        validate("param", idParam),
        async (c) => {
          await deleteReview(db, c.get("user")?.id ?? "", c.req.valid("param").id);
          return c.body(null, 204);
        },
      )

      .put(
        "/:id/like",
        describeRoute({ tags: ["Reviews"], summary: "Like a review", security: [{ session: [] }] }),
        requireUsername,
        writeLimit,
        validate("param", idParam),
        async (c) =>
          c.json(await setLike(db, c.get("user")?.id ?? "", c.req.valid("param").id, true)),
      )

      .delete(
        "/:id/like",
        describeRoute({
          tags: ["Reviews"],
          summary: "Remove your like",
          security: [{ session: [] }],
        }),
        requireUsername,
        writeLimit,
        validate("param", idParam),
        async (c) =>
          c.json(await setLike(db, c.get("user")?.id ?? "", c.req.valid("param").id, false)),
      )
  );
}
