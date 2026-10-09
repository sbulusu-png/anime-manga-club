import type { Hono } from "hono";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { listEntries } from "../src/db/schema/index.js";
import { createAnilistClient, toMediaRow } from "../src/lib/anilist.js";
import { upsertMedia } from "../src/services/media.js";
import type { AppEnv } from "../src/types.js";
import { anilistMedia, fakeAnilist } from "./fake-anilist.js";
import { makeApp } from "./helpers.js";
import { createMember, send } from "./session.js";
import { type TestDb, createTestDb } from "./test-db.js";

type Member = Awaited<ReturnType<typeof createMember>>;
interface Match {
  query: string;
  matches: { id: number; title: { display: string } }[];
}

let db: TestDb;
let app: Hono<AppEnv>;
let alice: Member, noName: Member;
const ids = new Map<string, number>();

const title = (id: number, english: string, romaji: string, popularity: number, extra = {}) =>
  anilistMedia(id, { title: { romaji, english, native: null }, popularity, ...extra });

// Only on "AniList": found by the fallback lookup and added to the catalog then.
const ON_ANILIST_ONLY = title(9, "Frieren: Beyond Journey's End", "Sousou no Frieren", 700);

beforeAll(async () => {
  ({ db } = await createTestDb());
  const rows = await upsertMedia(
    db,
    [
      title(1, "Naruto", "NARUTO", 900),
      title(2, "Naruto Shippuden", "NARUTO: Shippuuden", 800),
      title(3, "Fullmetal Alchemist: Brotherhood", "Hagane no Renkinjutsushi", 850),
      title(4, "Hidden", "Hidden", 10, { isAdult: true }),
    ].map(toMediaRow),
  );
  for (const row of rows) ids.set(row.titleEnglish ?? row.titleRomaji, row.id);
  ({ app } = makeApp(db));
  alice = await createMember(app, "Alice");
  noName = await createMember(app, "NoName", { username: null });
});

beforeEach(async () => {
  await db.delete(listEntries);
  ({ app } = makeApp(db, {
    anilist: createAnilistClient({ fetch: fakeAnilist({ catalog: [ON_ANILIST_ONLY] }).fetch }),
  }));
});

async function match(member: Member, titles: string[]) {
  const res = await send(app, "POST", "/api/list/match", {
    cookie: member.cookie,
    body: { titles },
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { results: Match[] }).results;
}
const best = (m: Match | undefined) => m?.matches[0]?.title.display;

describe("typing a list", () => {
  it("finds the best match for each line, with alternatives", async () => {
    const results = await match(alice, ["naruto", "hagane no renkinjutsushi", "  Naruto  "]);
    // The repeated line is matched once.
    expect(results.map((r) => r.query)).toEqual(["naruto", "hagane no renkinjutsushi"]);
    expect(best(results[0])).toBe("Naruto");
    expect(results[0]?.matches.map((m) => m.title.display)).toContain("Naruto Shippuden");
    expect(best(results[1])).toBe("Fullmetal Alchemist: Brotherhood");
  });

  it("looks up titles the catalog doesn't have on AniList, and reports misses", async () => {
    const results = await match(alice, ["sousou no frieren", "no such anime zzz"]);
    expect(best(results[0])).toBe("Frieren: Beyond Journey's End");
    expect(results[1]?.matches).toEqual([]);
  });

  it("never offers adult titles", async () => {
    const results = await match(alice, ["hidden"]);
    expect(results[0]?.matches).toEqual([]);
  });

  it("adds the chosen titles in one go, skipping adult and unknown ones", async () => {
    const res = await send(app, "POST", "/api/list/bulk", {
      cookie: alice.cookie,
      body: {
        items: [
          { mediaId: ids.get("Naruto"), status: "completed" },
          { mediaId: ids.get("Fullmetal Alchemist: Brotherhood"), status: "current" },
          { mediaId: ids.get("Hidden"), status: "completed" },
          { mediaId: 999_999, status: "completed" },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: 2 });

    // Adding again updates the status rather than duplicating the entry.
    await send(app, "POST", "/api/list/bulk", {
      cookie: alice.cookie,
      body: { items: [{ mediaId: ids.get("Naruto"), status: "dropped" }] },
    });
    const rows = await db.select().from(listEntries).where(eq(listEntries.userId, alice.id));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.mediaId === ids.get("Naruto"))?.status).toBe("dropped");
  });

  it("feeds the suggestion engine", async () => {
    await send(app, "POST", "/api/list/bulk", {
      cookie: alice.cookie,
      body: { items: [{ mediaId: ids.get("Naruto"), status: "completed" }] },
    });
    const res = await send(app, "GET", "/api/recommendations", { cookie: alice.cookie });
    const { basedOn } = (await res.json()) as { basedOn: { listEntries: number } };
    expect(basedOn.listEntries).toBe(1);
  });

  it("checks who's asking and how much they send", async () => {
    expect(
      (await send(app, "POST", "/api/list/match", { body: { titles: ["naruto"] } })).status,
    ).toBe(401);
    expect(
      (
        await send(app, "POST", "/api/list/match", {
          cookie: noName.cookie,
          body: { titles: ["naruto"] },
        })
      ).status,
    ).toBe(403);
    const tooMany = Array.from({ length: 51 }, (_, i) => `title ${String(i)}`);
    expect(
      (
        await send(app, "POST", "/api/list/match", {
          cookie: alice.cookie,
          body: { titles: tooMany },
        })
      ).status,
    ).toBe(400);
  });
});
