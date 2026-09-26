import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";

import type { Db } from "../db/client.js";
import { AppError } from "../lib/errors.js";
import { validate } from "../lib/validation.js";
import { isMonday, mondayOf } from "../lib/week.js";
import { requireRole } from "../middleware/auth.js";
import {
  addSuggestion,
  removeSuggestion,
  suggestionArchive,
  suggestionsForWeek,
  updateSuggestionNote,
} from "../services/club.js";
import type { AppEnv } from "../types.js";

const monday = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date like 2026-09-21")
  .refine(isMonday, "must be a Monday (club weeks start on Monday)");

const note = z
  .string()
  .trim()
  .max(500)
  .transform((value) => value || null);

const addBody = z.strictObject({
  mediaId: z.number().int().positive().max(2_147_483_647),
  weekStart: monday.optional(),
  note: note.optional(),
});

const archiveQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(300).optional(),
});

const idParam = z.object({ id: z.uuid() });

interface ClubRouteDeps {
  db: Db;
  /** Club weeks start on Monday in this timezone. */
  timeZone: string;
}

export function clubRoutes({ db, timeZone }: ClubRouteDeps) {
  const adminOnly = requireRole("admin");

  return (
    new Hono<AppEnv>()
      // This week's suggestions, or ?week=YYYY-MM-DD for another week.
      .get(
        "/suggestions/current",
        describeRoute({
          tags: ["Club"],
          summary: "This week's club suggestions (upcoming weeks: admins only)",
        }),
        validate("query", z.object({ week: monday.optional() })),
        async (c) => {
          const thisWeek = mondayOf(new Date(), timeZone);
          const weekStart = c.req.valid("query").week ?? thisWeek;
          // Leads can plan ahead; everyone else sees a week once it starts.
          if (weekStart > thisWeek && c.get("user")?.role !== "admin") {
            throw new AppError(403, "WEEK_NOT_STARTED", "That week's picks aren't out yet.");
          }
          return c.json({ weekStart, items: await suggestionsForWeek(db, weekStart) });
        },
      )

      // Every week's suggestions, newest first.
      .get(
        "/suggestions",
        describeRoute({
          tags: ["Club"],
          summary: "Archive of club suggestions up to this week, newest week first",
        }),
        validate("query", archiveQuery),
        async (c) => {
          const { limit, cursor } = c.req.valid("query");
          const thisWeek = mondayOf(new Date(), timeZone);
          return c.json(await suggestionArchive(db, limit, thisWeek, cursor));
        },
      )

      .post(
        "/suggestions",
        describeRoute({
          tags: ["Club"],
          summary: "Suggest a title for a week (admins)",
          security: [{ session: [] }],
        }),
        adminOnly,
        validate("json", addBody),
        async (c) => {
          const { weekStart, ...input } = c.req.valid("json");
          const item = await addSuggestion(db, c.get("user")?.id ?? "", {
            ...input,
            weekStart: weekStart ?? mondayOf(new Date(), timeZone),
          });
          return c.json({ item }, 201);
        },
      )

      .patch(
        "/suggestions/:id",
        describeRoute({
          tags: ["Club"],
          summary: "Edit a suggestion's note (admins)",
          security: [{ session: [] }],
        }),
        adminOnly,
        validate("param", idParam),
        validate("json", z.strictObject({ note: note.nullable() })),
        async (c) =>
          c.json({
            item: await updateSuggestionNote(db, c.req.valid("param").id, c.req.valid("json").note),
          }),
      )

      .delete(
        "/suggestions/:id",
        describeRoute({
          tags: ["Club"],
          summary: "Remove a suggestion (admins)",
          security: [{ session: [] }],
        }),
        adminOnly,
        validate("param", idParam),
        async (c) => {
          await removeSuggestion(db, c.req.valid("param").id);
          return c.body(null, 204);
        },
      )
  );
}
