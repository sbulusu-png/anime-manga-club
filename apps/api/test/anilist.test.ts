import { describe, expect, it } from "vitest";

import {
  type AnilistMedia,
  cleanDescription,
  toMediaRow,
  toWhereToLinks,
} from "../src/lib/anilist.js";

const sample: AnilistMedia = {
  id: 21,
  idMal: 21,
  type: "ANIME",
  format: "TV",
  status: "RELEASING",
  title: { romaji: "ONE PIECE", english: "ONE PIECE", native: "ONE PIECE" },
  description: "Gold Roger was known as the <i>Pirate King</i>.<br><br>Luffy &amp; crew.",
  coverImage: { extraLarge: "https://img.example/cover.jpg", color: "#e4a15d" },
  bannerImage: null,
  genres: ["Action", "Adventure"],
  tags: [
    { name: "Pirates", rank: 95, isMediaSpoiler: false, isAdult: false },
    { name: "Big Reveal", rank: 90, isMediaSpoiler: true, isAdult: false },
    { name: "Minor Tag", rank: 30, isMediaSpoiler: false, isAdult: false },
    { name: "Ensemble Cast", rank: 99, isMediaSpoiler: false, isAdult: false },
  ],
  season: "FALL",
  seasonYear: 1999,
  startDate: { year: 1999 },
  episodes: null,
  chapters: null,
  volumes: null,
  averageScore: 88,
  popularity: 600000,
  isAdult: false,
};

describe("cleanDescription", () => {
  it("turns AniList HTML into plain text", () => {
    expect(cleanDescription(sample.description)).toBe(
      "Gold Roger was known as the Pirate King.\n\nLuffy & crew.",
    );
  });

  it("returns null for missing or blank descriptions", () => {
    expect(cleanDescription(null)).toBeNull();
    expect(cleanDescription("<br>")).toBeNull();
  });
});

describe("toMediaRow", () => {
  it("maps AniList fields onto a media row", () => {
    expect(toMediaRow(sample)).toMatchObject({
      anilistId: 21,
      type: "anime",
      titleRomaji: "ONE PIECE",
      coverImageUrl: "https://img.example/cover.jpg",
      anilistScore: 88,
      startYear: 1999,
    });
  });

  it("keeps strong, spoiler-free tags, strongest first", () => {
    expect(toMediaRow(sample).tags).toEqual(["Ensemble Cast", "Pirates"]);
  });

  it("maps manga", () => {
    expect(toMediaRow({ ...sample, type: "MANGA" }).type).toBe("manga");
  });
});

describe("toWhereToLinks", () => {
  const link = (overrides: Partial<Parameters<typeof toWhereToLinks>[0][number]>) => ({
    site: "MANGA Plus",
    url: "https://mangaplus.shueisha.co.jp/titles/100020",
    type: "STREAMING",
    language: "English",
    color: "#000000",
    icon: "https://s4.anilist.co/file/anilistcdn/link/icon/1.png",
    isDisabled: false,
    ...overrides,
  });

  it("keeps official places to watch or read, and the official site", () => {
    expect(
      toWhereToLinks([
        link({}),
        link({ site: "Official Site", url: "https://one-piece.com/", type: "INFO", icon: null }),
      ]),
    ).toEqual([
      {
        site: "MANGA Plus",
        url: "https://mangaplus.shueisha.co.jp/titles/100020",
        kind: "stream",
        language: "English",
        color: "#000000",
        icon: "https://s4.anilist.co/file/anilistcdn/link/icon/1.png",
      },
      {
        site: "Official Site",
        url: "https://one-piece.com/",
        kind: "official",
        language: "English",
        color: "#000000",
        icon: null,
      },
    ]);
  });

  it("drops social, disabled, repeated and unsafe links", () => {
    expect(
      toWhereToLinks([
        link({ type: "SOCIAL", url: "https://x.com/op" }),
        link({ isDisabled: true, url: "https://gone.example.com" }),
        link({}),
        link({ url: "https://mangaplus.shueisha.co.jp/titles/2" }), // same site and language
        link({ url: "javascript:alert(1)" }),
        link({ url: null }),
      ]).map((l) => l.url),
    ).toEqual(["https://mangaplus.shueisha.co.jp/titles/100020"]);
  });

  it("keeps each language, even when two share an address", () => {
    const shared = "https://mangaplus.shueisha.co.jp/titles/800001";
    expect(
      toWhereToLinks([
        link({ language: "German", url: shared }),
        link({ language: "Spanish", url: shared }),
      ]).map((l) => l.language),
    ).toEqual(["German", "Spanish"]);
  });

  it("only trusts plain colours and AniList-hosted icons", () => {
    const [cleaned] = toWhereToLinks([
      link({ color: "red; background: url(x)", icon: "https://evil.example.com/icon.png" }),
    ]);
    expect(cleaned).toMatchObject({ color: null, icon: null });
  });
});
