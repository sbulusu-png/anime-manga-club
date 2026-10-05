import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";

import type { Db } from "../db/client.js";
import type { AnilistClient } from "../lib/anilist.js";
import { AppError } from "../lib/errors.js";
import { validate } from "../lib/validation.js";
import { requireAuth, requireUsername } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import {
  LIST_STATUSES,
  findUserIdByUsername,
  getEntry,
  importFromAnilist,
  listEntriesOf,
  removeEntry,
  saveEntry,
} from "../services/list.js";
import type { AppEnv } from "../types.js";

const mediaIdParam = z.object({
  mediaId: z.coerce.number().int().positive().max(2_147_483_647),
});

const listQuery = z.object({
  user: z.string().trim().min(1).max(30).optional(),
  status: z.enum(LIST_STATUSES).optional(),
  type: z.enum(["anime", "manga"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(300).optional(),
});

const saveBody = z.strictObject({
  status: z.enum(LIST_STATUSES),
  progress: z.number().int().min(0).max(100_000).optional(),
});

// AniList usernames: 2-20 letters and numbers.
const importBody = z.strictObject({
  source: z.literal("anilist"),
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{2,20}$/, "Enter your AniList username (letters and numbers)"),
});

interface ListRouteDeps {
  db: Db;
  anilist: AnilistClient;
  isTrustedProxy: (ip: string) => boolean;
}

/** Watchlists and reading lists. Lists are public, like on AniList. */
export function listRoutes({ db, anilist, isTrustedProxy }: ListRouteDeps) {
  const writeLimit = rateLimit({
    name: "list-writes",
    windowMs: 60_000,
    max: 60,
    isTrustedProxy,
    keyBy: (c) => c.get("user")?.id,
  });

  // Each import can take a dozen AniList requests, so members get a few per 10 minutes.
  const importLimit = rateLimit({
    name: "list-imports",
    windowMs: 10 * 60_000,
    max: 3,
    isTrustedProxy,
    keyBy: (c) => c.get("user")?.id,
  });

  return (
    new Hono<AppEnv>()
      .post(
        "/import",
        describeRoute({
          tags: ["Lists"],
          summary: "Import your AniList anime and manga lists (statuses, progress, scores)",
          security: [{ session: [] }],
        }),
        requireUsername,
        importLimit,
        validate("json", importBody),
        async (c) =>
          c.json(
            await importFromAnilist(
              db,
              anilist,
              c.get("user")?.id ?? "",
              c.req.valid("json").username,
            ),
          ),
      )

      // ?user=<username> for anyone's list; without it, the signed-in member's own.
      .get(
        "/",
        describeRoute({
          tags: ["Lists"],
          summary: "A watchlist/reading list: yours, or anyone's with ?user=",
        }),
        validate("query", listQuery),
        async (c) => {
          const { user, ...query } = c.req.valid("query");
          const viewerId = c.get("user")?.id;
          if (!user && !viewerId) {
            throw new AppError(401, "UNAUTHENTICATED", "Sign in, or pass ?user= to see a list");
          }
          const userId = user ? await findUserIdByUsername(db, user) : (viewerId ?? "");
          return c.json(await listEntriesOf(db, { ...query, userId }));
        },
      )

      .get(
        "/:mediaId",
        describeRoute({
          tags: ["Lists"],
          summary: "Your list entry for a title, if any",
          security: [{ session: [] }],
        }),
        requireAuth,
        validate("param", mediaIdParam),
        async (c) =>
          c.json({
            item: await getEntry(db, c.get("user")?.id ?? "", c.req.valid("param").mediaId),
          }),
      )

      .put(
        "/:mediaId",
        describeRoute({
          tags: ["Lists"],
          summary: "Add or update a title on your list",
          security: [{ session: [] }],
        }),
        requireUsername,
        writeLimit,
        validate("param", mediaIdParam),
        validate("json", saveBody),
        async (c) =>
          c.json({
            item: await saveEntry(
              db,
              c.get("user")?.id ?? "",
              c.req.valid("param").mediaId,
              c.req.valid("json"),
            ),
          }),
      )

      .delete(
        "/:mediaId",
        describeRoute({
          tags: ["Lists"],
          summary: "Remove a title from your list",
          security: [{ session: [] }],
        }),
        requireAuth,
        writeLimit,
        validate("param", mediaIdParam),
        async (c) => {
          await removeEntry(db, c.get("user")?.id ?? "", c.req.valid("param").mediaId);
          return c.body(null, 204);
        },
      )
  );
}
