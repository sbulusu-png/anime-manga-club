import { beforeAll, describe, expect, it } from "vitest";

import { toMediaRow } from "../src/lib/anilist.js";
import { kindOf, upsertMedia } from "../src/services/media.js";
import { anilistMedia } from "./fake-anilist.js";
import { makeApp } from "./helpers.js";
import { type TestDb, createTestDb } from "./test-db.js";

interface Item {
  kind: string;
  title: { display: string };
}

let db: TestDb;
let app: ReturnType<typeof makeApp>["app"];

const comic = (id: number, name: string, countryOfOrigin: string | null) =>
  anilistMedia(id, {
    type: "MANGA",
    format: "MANGA",
    countryOfOrigin,
    title: { romaji: name, english: null, native: null },
    popularity: 1000 - id,
  });

beforeAll(async () => {
  ({ db } = await createTestDb());
  ({ app } = makeApp(db));
  await upsertMedia(
    db,
    [
      anilistMedia(1, { title: { romaji: "An Anime", english: null, native: null } }),
      comic(2, "Japanese Manga", "JP"),
      comic(3, "Unknown Origin", null), // older rows: treated as manga
      comic(4, "Solo Leveling", "KR"),
      comic(5, "Tales of Demons and Gods", "CN"),
      comic(6, "Taiwanese Manhua", "TW"),
    ].map(toMediaRow),
  );
});

async function browse(type: string) {
  const res = await app.request(`/api/media?type=${type}`);
  expect(res.status).toBe(200);
  return ((await res.json()) as { items: Item[] }).items;
}

describe("manga, manhwa and manhua", () => {
  it.each([
    ["anime", ["An Anime"]],
    ["manga", ["Japanese Manga", "Unknown Origin"]],
    ["manhwa", ["Solo Leveling"]],
    ["manhua", ["Tales of Demons and Gods", "Taiwanese Manhua"]],
  ])("browses %s on its own", async (type, expected) => {
    expect((await browse(type)).map((i) => i.title.display)).toEqual(expected);
  });

  it("labels every title with what it is", async () => {
    const all = await browse("manhwa");
    expect(all[0]?.kind).toBe("manhwa");
    expect(kindOf({ type: "manga", country: "TW" })).toBe("manhua");
    expect(kindOf({ type: "manga", country: null })).toBe("manga");
    expect(kindOf({ type: "anime", country: "KR" })).toBe("anime");
  });

  it("rejects kinds it doesn't know", async () => {
    expect((await app.request("/api/media?type=webtoon")).status).toBe(400);
  });
});
