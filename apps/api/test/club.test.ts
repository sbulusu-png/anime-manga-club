import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { clubSuggestions, users } from "../src/db/schema/index.js";
import { toMediaRow } from "../src/lib/anilist.js";
import type { ErrorBody } from "../src/lib/errors.js";
import { mondayOf } from "../src/lib/week.js";
import { upsertMedia } from "../src/services/media.js";
import type { AppEnv } from "../src/types.js";
import { anilistMedia } from "./fake-anilist.js";
import { makeApp } from "./helpers.js";
import { createMember, send } from "./session.js";
import { type TestDb, createTestDb } from "./test-db.js";

/** "2026-09-21" plus `days`, as YYYY-MM-DD. */
function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface Suggestion {
  id: string;
  weekStart: string;
  note: string | null;
  suggestedBy: { username: string } | null;
  media: { id: number; title: { display: string } };
}
type Member = Awaited<ReturnType<typeof createMember>>;

let db: TestDb;
let app: Hono<AppEnv>;
let admin: Member, member: Member;
let frieren: number, berserk: number;

beforeAll(async () => {
  ({ db } = await createTestDb());
  ({ app } = makeApp(db));
  const rows = await upsertMedia(
    db,
    [
      anilistMedia(1, { title: { romaji: "Frieren", english: null, native: null } }),
      anilistMedia(2, { title: { romaji: "Berserk", english: null, native: null } }),
    ].map(toMediaRow),
  );
  [frieren, berserk] = rows.map((r) => r.id) as [number, number];
  admin = await createMember(app, "Lead");
  member = await createMember(app, "Member");
  await db.update(users).set({ role: "admin" }).where(eq(users.id, admin.id));
});

beforeEach(async () => {
  await db.delete(clubSuggestions);
});

function suggest(who: Member, body: Record<string, unknown>) {
  return send(app, "POST", "/api/club/suggestions", { cookie: who.cookie, body });
}
async function suggested(body: Record<string, unknown>) {
  const res = await suggest(admin, body);
  expect(res.status).toBe(201);
  return ((await res.json()) as { item: Suggestion }).item;
}

describe("club suggestions", () => {
  it("lets admins suggest titles for this week, with a note", async () => {
    const item = await suggested({ mediaId: frieren, note: "  Perfect for the long weekend  " });

    expect(item).toMatchObject({
      weekStart: mondayOf(new Date(), "Asia/Kolkata"),
      note: "Perfect for the long weekend",
      suggestedBy: { username: "lead" },
      media: { title: { display: "Frieren" } },
    });

    const res = await send(app, "GET", "/api/club/suggestions/current");
    const current = (await res.json()) as { weekStart: string; items: Suggestion[] };
    expect(current.weekStart).toBe(item.weekStart);
    expect(current.items.map((s) => s.id)).toEqual([item.id]);
  });

  it("can plan ahead for a future week", async () => {
    await suggested({ mediaId: berserk, weekStart: "2020-01-06" });

    const res = await send(app, "GET", "/api/club/suggestions/current?week=2020-01-06");
    expect(((await res.json()) as { items: Suggestion[] }).items).toHaveLength(1);
  });

  it("only accepts Mondays", async () => {
    const res = await suggest(admin, { mediaId: frieren, weekStart: "2020-01-07" });

    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorBody).error.message).toMatch(/Monday/);
  });

  it("won't suggest the same title twice in one week", async () => {
    await suggested({ mediaId: frieren, weekStart: "2020-01-06" });

    const again = await suggest(admin, { mediaId: frieren, weekStart: "2020-01-06" });
    expect(again.status).toBe(409);
    expect(((await again.json()) as ErrorBody).error.code).toBe("ALREADY_SUGGESTED");
  });

  it("is admin-only for changes, but public to read", async () => {
    expect((await suggest(member, { mediaId: frieren })).status).toBe(403);
    expect(
      (await send(app, "POST", "/api/club/suggestions", { body: { mediaId: frieren } })).status,
    ).toBe(401);
    expect((await send(app, "GET", "/api/club/suggestions/current")).status).toBe(200);
  });

  it("lets admins edit the note and remove suggestions", async () => {
    const { id } = await suggested({ mediaId: frieren, note: "old" });
    const path = `/api/club/suggestions/${id}`;

    const edited = await send(app, "PATCH", path, { cookie: admin.cookie, body: { note: "new" } });
    expect(await edited.json()).toMatchObject({ item: { note: "new" } });
    const cleared = await send(app, "PATCH", path, { cookie: admin.cookie, body: { note: null } });
    expect(await cleared.json()).toMatchObject({ item: { note: null } });

    expect((await send(app, "DELETE", path, { cookie: member.cookie })).status).toBe(403);
    expect((await send(app, "DELETE", path, { cookie: admin.cookie })).status).toBe(204);
    expect((await send(app, "DELETE", path, { cookie: admin.cookie })).status).toBe(404);
  });

  it("keeps an archive, newest week first, with paging", async () => {
    await suggested({ mediaId: frieren, weekStart: "2020-01-06" });
    await suggested({ mediaId: berserk, weekStart: "2020-01-13" });
    await suggested({ mediaId: frieren, weekStart: "2020-01-20" });

    const archive = async (query: string) =>
      (await (await send(app, "GET", `/api/club/suggestions${query}`)).json()) as {
        items: Suggestion[];
        nextCursor: string | null;
      };
    const first = await archive("?limit=2");
    const second = await archive(`?limit=2&cursor=${first.nextCursor ?? ""}`);

    expect([...first.items, ...second.items].map((s) => s.weekStart)).toEqual([
      "2020-01-20",
      "2020-01-13",
      "2020-01-06",
    ]);
    expect(second.nextCursor).toBeNull();
  });

  it("keeps weeks planned ahead private until they start", async () => {
    const upcoming = addDays(mondayOf(new Date(), "Asia/Kolkata"), 7);
    await suggested({ mediaId: frieren, weekStart: upcoming });
    await suggested({ mediaId: berserk, weekStart: "2020-01-06" });

    const archive = (await (await send(app, "GET", "/api/club/suggestions")).json()) as {
      items: Suggestion[];
    };
    expect(archive.items.map((s) => s.weekStart)).toEqual(["2020-01-06"]);

    const peek = `/api/club/suggestions/current?week=${upcoming}`;
    expect((await send(app, "GET", peek)).status).toBe(403);
    expect((await send(app, "GET", peek, { cookie: member.cookie })).status).toBe(403);
    const lead = await send(app, "GET", peek, { cookie: admin.cookie });
    expect(((await lead.json()) as { items: Suggestion[] }).items).toHaveLength(1);
  });

  it("keeps suggestions after their admin deletes their account", async () => {
    const temp = await createMember(app, "TempLead");
    await db.update(users).set({ role: "admin" }).where(eq(users.id, temp.id));
    const res = await suggest(temp, { mediaId: berserk, weekStart: "2020-02-03" });
    expect(res.status).toBe(201);

    await db.delete(users).where(eq(users.id, temp.id));

    const week = await send(app, "GET", "/api/club/suggestions/current?week=2020-02-03");
    expect(((await week.json()) as { items: Suggestion[] }).items[0]?.suggestedBy).toBeNull();
  });
});
