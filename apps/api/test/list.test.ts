import type { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { listEntries } from "../src/db/schema/index.js";
import { toMediaRow } from "../src/lib/anilist.js";
import type { ErrorBody } from "../src/lib/errors.js";
import { upsertMedia } from "../src/services/media.js";
import type { AppEnv } from "../src/types.js";
import { anilistMedia } from "./fake-anilist.js";
import { makeApp } from "./helpers.js";
import { createMember, send } from "./session.js";
import { type TestDb, createTestDb } from "./test-db.js";

interface Entry {
  status: string;
  progress: number;
  total: number | null;
  media: { id: number; title: { display: string } };
}
type Member = Awaited<ReturnType<typeof createMember>>;

let db: TestDb;
let app: Hono<AppEnv>;
let alice: Member, bob: Member, noName: Member;
let frieren: number, berserk: number, ongoing: number, adult: number;

beforeAll(async () => {
  ({ db } = await createTestDb());
  ({ app } = makeApp(db));
  const rows = await upsertMedia(
    db,
    [
      anilistMedia(1, { title: { romaji: "Frieren", english: null, native: null }, episodes: 28 }),
      anilistMedia(2, {
        type: "MANGA",
        title: { romaji: "Berserk", english: null, native: null },
        episodes: null,
        chapters: 374,
      }),
      anilistMedia(3, {
        title: { romaji: "Still Airing", english: null, native: null },
        episodes: null, // unknown total
        status: "RELEASING",
      }),
      anilistMedia(4, { title: { romaji: "Adult", english: null, native: null }, isAdult: true }),
    ].map(toMediaRow),
  );
  [frieren, berserk, ongoing, adult] = rows.map((r) => r.id) as [number, number, number, number];
  alice = await createMember(app, "Alice");
  bob = await createMember(app, "Bob");
  noName = await createMember(app, "NoName", { username: null });
});

beforeEach(async () => {
  await db.delete(listEntries);
  ({ app } = makeApp(db));
});

async function save(member: Member, mediaId: number, body: Record<string, unknown>) {
  return send(app, "PUT", `/api/list/${mediaId}`, { cookie: member.cookie, body });
}
async function saved(member: Member, mediaId: number, body: Record<string, unknown>) {
  const res = await save(member, mediaId, body);
  expect(res.status).toBe(200);
  return ((await res.json()) as { item: Entry }).item;
}
async function listOf(query: string, cookie = "") {
  const res = await send(app, "GET", `/api/list${query}`, { cookie });
  expect(res.status).toBe(200);
  return (await res.json()) as { items: Entry[]; nextCursor: string | null };
}

describe("saving to a list", () => {
  it("adds a title with a status and progress, then updates it", async () => {
    expect(await saved(alice, frieren, { status: "current", progress: 5 })).toMatchObject({
      status: "current",
      progress: 5,
      total: 28,
      media: { title: { display: "Frieren" } },
    });

    expect(await saved(alice, frieren, { status: "paused" })).toMatchObject({
      status: "paused",
      progress: 5, // kept when not sent
    });
  });

  it("fills in progress when a title is marked completed", async () => {
    expect(await saved(alice, berserk, { status: "completed" })).toMatchObject({
      progress: 374,
      total: 374,
    });
  });

  it("doesn't guess progress when the total is unknown", async () => {
    expect(await saved(alice, ongoing, { status: "completed" })).toMatchObject({
      progress: 0,
      total: null,
    });
  });

  it("rejects progress past the last episode or chapter", async () => {
    const res = await save(alice, frieren, { status: "current", progress: 29 });

    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorBody).error).toMatchObject({
      code: "PROGRESS_TOO_HIGH",
      message: "This title only has 28 episodes.",
    });
  });

  it.each([
    ["an unknown status", { status: "watching" }],
    ["negative progress", { status: "current", progress: -1 }],
    ["fractional progress", { status: "current", progress: 1.5 }],
    ["extra fields", { status: "current", rating: 5 }],
  ])("rejects %s", async (_name, body) => {
    expect((await save(alice, frieren, body)).status).toBe(400);
  });

  it("no longer accepts plan to watch", async () => {
    expect((await save(alice, frieren, { status: "planning" })).status).toBe(400);
  });

  it.each([
    ["unknown titles", 999_999],
    ["adult titles", -1],
  ])("answers 404 for %s", async (_name, id) => {
    const res = await save(alice, id === -1 ? adult : id, { status: "current" });

    expect(res.status).toBe(404);
  });

  it("requires a signed-in member with a username", async () => {
    expect(
      (await send(app, "PUT", `/api/list/${frieren}`, { body: { status: "current" } })).status,
    ).toBe(401);
    expect((await save(noName, frieren, { status: "current" })).status).toBe(403);
  });
});

describe("reading lists", () => {
  it("shows the member's own list, most recently updated first", async () => {
    await saved(alice, frieren, { status: "current", progress: 3 });
    await saved(alice, berserk, { status: "paused" });

    const { items } = await listOf("", alice.cookie);
    expect(items.map((e) => e.media.title.display)).toEqual(["Berserk", "Frieren"]);
  });

  it("filters by status and type", async () => {
    await saved(alice, frieren, { status: "current" });
    await saved(alice, berserk, { status: "current" });
    await saved(alice, ongoing, { status: "dropped" });

    expect((await listOf("?status=current&type=manga", alice.cookie)).items).toHaveLength(1);
    expect((await listOf("?status=dropped", alice.cookie)).items).toHaveLength(1);
  });

  it("shows anyone's list by username, and pages through it", async () => {
    await saved(bob, frieren, { status: "completed" });
    await saved(bob, berserk, { status: "current" });
    await saved(bob, ongoing, { status: "paused" });

    const first = await listOf("?user=BOB&limit=2");
    const second = await listOf(`?user=bob&limit=2&cursor=${first.nextCursor ?? ""}`);
    expect([...first.items, ...second.items]).toHaveLength(3);
    expect(second.nextCursor).toBeNull();
  });

  it("needs a username when signed out, and 404s for unknown members", async () => {
    expect((await send(app, "GET", "/api/list")).status).toBe(401);
    expect((await send(app, "GET", "/api/list?user=nobody")).status).toBe(404);
  });

  it("returns one entry, or null", async () => {
    await saved(alice, frieren, { status: "current", progress: 2 });

    const one = await send(app, "GET", `/api/list/${frieren}`, { cookie: alice.cookie });
    expect(await one.json()).toMatchObject({ item: { progress: 2 } });
    const none = await send(app, "GET", `/api/list/${berserk}`, { cookie: alice.cookie });
    expect(await none.json()).toEqual({ item: null });
  });

  it("removes a title, and 404s if it wasn't there", async () => {
    await saved(alice, frieren, { status: "current" });
    const remove = () => send(app, "DELETE", `/api/list/${frieren}`, { cookie: alice.cookie });

    expect((await remove()).status).toBe(204);
    expect((await remove()).status).toBe(404);
  });
});
