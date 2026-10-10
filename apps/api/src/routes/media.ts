import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";

import type { Db } from "../db/client.js";
import type { AnilistClient } from "../lib/anilist.js";
import { AppError } from "../lib/errors.js";
import { RATINGS } from "../lib/rating.js";
import { validate } from "../lib/validation.js";
import { requireRole } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import {
  MEDIA_KINDS,
  MEDIA_SORTS,
  discoverMedia,
  getCharacters,
  getMedia,
  getOrImportByAnilistId,
  isStale,
  listGenres,
  listMedia,
  refreshMedia,
  setClubVerdict,
  toMediaDetail,
  toMediaSummary,
  verdictGiver,
} from "../services/media.js";
import { similarTo, toRecommendationJson } from "../services/recommendations.js";
import type { AppEnv } from "../types.js";

interface MediaRouteDeps {
  db: Db;
  anilist: AnilistClient;
  isTrustedProxy: (ip: string) => boolean;
}

/** Accepts `?genre=A&genre=B` or a single `?genre=A`. */
const stringList = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => (Array.isArray(value) ? value : [value]))
  .pipe(z.array(z.string().trim().min(1).max(50)).max(10));

const mediaType = z.enum(["anime", "manga"]);
const upperWord = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z_]{1,30}$/, "must be a single AniList value like TV or FINISHED");

const listQuery = z.object({
  // Browse also splits comics by origin: manga (Japan), manhwa (Korea), manhua (China).
  type: z.enum(MEDIA_KINDS).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  genre: stringList.optional(),
  tag: stringList.optional(),
  season: z.enum(["WINTER", "SPRING", "SUMMER", "FALL"]).optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  format: upperWord.optional(),
  status: upperWord.optional(),
  sort: z.enum(MEDIA_SORTS).default("popularity"),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  cursor: z.string().max(200).optional(),
});

const discoverQuery = z.object({
  q: z.string().trim().min(2).max(100),
  type: mediaType.optional(),
});

const idParam = z.object({ id: z.coerce.number().int().positive().max(2_147_483_647) });

const notFound = () => new AppError(404, "MEDIA_NOT_FOUND", "No anime or manga with that id.");

export function mediaRoutes({ db, anilist, isTrustedProxy }: MediaRouteDeps) {
  // Routes that may call AniList get a per-visitor limit on top of the global budget.
  const anilistLimit = rateLimit({ name: "anilist", windowMs: 60_000, max: 10, isTrustedProxy });

  return (
    new Hono<AppEnv>()
      .get(
        "/",
        describeRoute({ tags: ["Catalog"], summary: "Browse and search anime and manga" }),
        validate("query", listQuery),
        async (c) => {
          const { genre, tag, ...query } = c.req.valid("query");
          const { items, nextCursor } = await listMedia(db, { ...query, genres: genre, tags: tag });
          return c.json({ items: items.map(toMediaSummary), nextCursor });
        },
      )

      .get(
        "/genres",
        describeRoute({ tags: ["Catalog"], summary: "Every genre in the catalog, for filters" }),
        async (c) => c.json({ genres: await listGenres(db) }),
      )

      // Titles we don't have yet: searches AniList and imports the matches.
      .get(
        "/discover",
        describeRoute({
          tags: ["Catalog"],
          summary: "Search AniList for titles the club doesn't have yet and import them",
        }),
        anilistLimit,
        validate("query", discoverQuery),
        async (c) => {
          const { q, type } = c.req.valid("query");
          const rows = await discoverMedia(db, anilist, q, type);
          return c.json({ items: rows.map(toMediaSummary) });
        },
      )

      // Lets links use AniList ids; imports the title on first request.
      .get(
        "/anilist/:id",
        describeRoute({ tags: ["Catalog"], summary: "Find (or import) a title by its AniList id" }),
        anilistLimit,
        validate("param", idParam),
        async (c) => {
          const row = await getOrImportByAnilistId(db, anilist, c.req.valid("param").id);
          if (!row) throw notFound();
          return c.json({ id: row.id, item: toMediaSummary(row) });
        },
      )

      // "Members who loved this also loved...", falling back to genre/tag overlap.
      .get(
        "/:id/similar",
        describeRoute({
          tags: ["Suggestions"],
          summary: "Titles similar to this one, with reasons",
        }),
        validate("param", idParam),
        validate("query", z.object({ limit: z.coerce.number().int().min(1).max(30).default(12) })),
        async (c) => {
          const items = await similarTo(db, c.req.valid("param").id, c.req.valid("query").limit);
          return c.json({ items: items.map(toRecommendationJson) });
        },
      )

      .get(
        "/:id",
        describeRoute({
          tags: ["Catalog"],
          summary: "One title with synopsis, tags, characters and the club verdict",
        }),
        validate("param", idParam),
        async (c) => {
          const row = await getMedia(db, c.req.valid("param").id);
          if (!row) throw notFound();

          if (isStale(row)) {
            // Serve what we have now; refresh in the background for the next visitor.
            refreshMedia(db, anilist, row).catch((err: unknown) => {
              c.get("log").warn({ err, mediaId: row.id }, "background refresh failed");
            });
          }

          const [characters, giver] = await Promise.all([
            // Characters are a nice-to-have: the page still loads if AniList is down.
            getCharacters(anilist, row.anilistId).catch((err: unknown) => {
              c.get("log").warn({ err, mediaId: row.id }, "could not load characters");
              return [];
            }),
            verdictGiver(db, row),
          ]);

          return c.json({ item: toMediaDetail(row, characters, giver) });
        },
      )

      // The club verdict is the club lead's call.
      .put(
        "/:id/club-verdict",
        describeRoute({
          tags: ["Club"],
          summary: "Give or change a title's club verdict (club leads)",
          security: [{ session: [] }],
        }),
        requireRole("admin"),
        validate("param", idParam),
        validate("json", z.strictObject({ verdict: z.enum(RATINGS) })),
        async (c) => {
          const lead = c.get("user");
          if (!lead) throw new Error("unreachable");
          const row = await setClubVerdict(
            db,
            c.req.valid("param").id,
            c.req.valid("json").verdict,
            lead.id,
          );
          if (!row) throw notFound();
          return c.json({ club: { verdict: c.req.valid("json").verdict } });
        },
      )
      .delete(
        "/:id/club-verdict",
        describeRoute({
          tags: ["Club"],
          summary: "Remove a title's club verdict (club leads)",
          security: [{ session: [] }],
        }),
        requireRole("admin"),
        validate("param", idParam),
        async (c) => {
          const lead = c.get("user");
          if (!lead) throw new Error("unreachable");
          const row = await setClubVerdict(db, c.req.valid("param").id, null, lead.id);
          if (!row) throw notFound();
          return c.body(null, 204);
        },
      )
  );
}
