import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { media, users } from "../src/db/schema/index.js";
import { toMediaRow } from "../src/lib/anilist.js";
import { upsertMedia } from "../src/services/media.js";
import type { AppEnv } from "../src/types.js";
import { anilistMedia } from "./fake-anilist.js";
import { makeApp } from "./helpers.js";
import { createMember, send } from "./session.js";
import { type TestDb, createTestDb } from "./test-db.js";

type Member = Awaited<ReturnType<typeof createMember>>;

let db: TestDb;
let app: Hono<AppEnv>;
let lead: Member, member: Member;
let frieren: number, naruto: number, hidden: number;

beforeAll(async () => {
  ({ db } = await createTestDb());
  ({ app } = makeApp(db));
  const rows = await upsertMedia(
    db,
    [
      anilistMedia(1, { title: { romaji: "Sousou no Frieren", english: "Frieren", native: null } }),
      anilistMedia(2, { title: { romaji: "NARUTO", english: "Naruto", native: null } }),
      anilistMedia(3, {
        title: { romaji: "Hidden", english: "Hidden", native: null },
        isAdult: true,
      }),
    ].map(toMediaRow),
  );
  [frieren, naruto, hidden] = rows.map((r) => r.id) as [number, number, number];
  lead = await createMember(app, "Lead");
  await db.update(users).set({ role: "admin" }).where(eq(users.id, lead.id));
  member = await createMember(app, "Member");
});

beforeEach(async () => {
  await db.update(media).set({ clubVerdict: null, clubVerdictById: null, clubVerdictAt: null });
});

const give = (who: Member, mediaId: number, verdict: string, note?: string) =>
  send(app, "PUT", `/api/media/${String(mediaId)}/club-verdict`, {
    cookie: who.cookie,
    body: note === undefined ? { verdict } : { verdict, note },
  });

async function clubOf(mediaId: number) {
  const res = await send(app, "GET", `/api/media/${String(mediaId)}`);
  return ((await res.json()) as { item: { club: Record<string, unknown> } }).item.club;
}

describe("the club verdict", () => {
  it("is given, changed and removed by a club lead", async () => {
    expect(await clubOf(frieren)).toEqual({
      verdict: null,
      givenBy: null,
      givenAt: null,
      note: null,
    });

    expect((await give(lead, frieren, "go_for_it")).status).toBe(200);
    expect(await clubOf(frieren)).toMatchObject({
      verdict: "go_for_it",
      givenBy: { username: "lead" },
      givenAt: expect.any(String) as string,
    });

    await give(lead, frieren, "perfection");
    expect(await clubOf(frieren)).toMatchObject({ verdict: "perfection" });

    const removed = await send(app, "DELETE", `/api/media/${String(frieren)}/club-verdict`, {
      cookie: lead.cookie,
    });
    expect(removed.status).toBe(204);
    expect(await clubOf(frieren)).toEqual({
      verdict: null,
      givenBy: null,
      givenAt: null,
      note: null,
    });
  });

  it("can come with the lead's reason, which changes and goes with it", async () => {
    const res = await give(
      lead,
      frieren,
      "perfection",
      "  Quiet, patient and moving.\r\n\n\n\nWatch it slowly.  ",
    );
    expect(await res.json()).toEqual({
      club: { verdict: "perfection", note: "Quiet, patient and moving.\n\nWatch it slowly." },
    });
    expect(await clubOf(frieren)).toMatchObject({
      verdict: "perfection",
      note: "Quiet, patient and moving.\n\nWatch it slowly.",
    });

    // Saving again replaces the note; a blank one means none.
    await give(lead, frieren, "go_for_it", "   ");
    expect(await clubOf(frieren)).toMatchObject({ verdict: "go_for_it", note: null });

    expect((await give(lead, frieren, "go_for_it", "x".repeat(1001))).status).toBe(400);

    await give(lead, frieren, "skip", "Not for us.");
    await send(app, "DELETE", `/api/media/${String(frieren)}/club-verdict`, {
      cookie: lead.cookie,
    });
    expect(await clubOf(frieren)).toMatchObject({ verdict: null, note: null });
  });

  it("keeps the note off the catalog cards", async () => {
    await give(lead, naruto, "go_for_it", "Classic.");
    const res = await send(app, "GET", "/api/media?sort=club&limit=1");
    const { items } = (await res.json()) as { items: { club: Record<string, unknown> }[] };
    expect(items[0]?.club).toEqual({ verdict: "go_for_it" });
  });

  it("can only be given by club leads", async () => {
    expect((await give(member, frieren, "skip")).status).toBe(403);
    const guest = await send(app, "PUT", `/api/media/${String(frieren)}/club-verdict`, {
      body: { verdict: "skip" },
    });
    expect(guest.status).toBe(401);
    expect(await clubOf(frieren)).toMatchObject({ verdict: null });
  });

  it("checks the verdict and the title", async () => {
    expect((await give(lead, frieren, "masterpiece")).status).toBe(400);
    expect((await give(lead, 999_999, "skip")).status).toBe(404);
    expect((await give(lead, hidden, "skip")).status).toBe(404);
  });

  it("shows on cards and sorts the catalog, titles without one last", async () => {
    await give(lead, naruto, "perfection");
    await give(lead, frieren, "timepass");

    const res = await send(app, "GET", "/api/media?sort=club&limit=50");
    const { items } = (await res.json()) as {
      items: { id: number; club: { verdict: string | null } }[];
    };
    expect(items.slice(0, 2).map((i) => [i.id, i.club.verdict])).toEqual([
      [naruto, "perfection"],
      [frieren, "timepass"],
    ]);
    expect(items.slice(2).every((i) => i.club.verdict === null)).toBe(true);
  });

  it("stays when the lead who gave it leaves", async () => {
    const leaving = await createMember(app, "LeavingLead");
    await db.update(users).set({ role: "admin" }).where(eq(users.id, leaving.id));
    await give(leaving, naruto, "go_for_it");

    await db.delete(users).where(eq(users.id, leaving.id));
    expect(await clubOf(naruto)).toMatchObject({ verdict: "go_for_it", givenBy: null });
  });
});
