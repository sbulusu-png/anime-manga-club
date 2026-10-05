import { describe, expect, it } from "vitest";

import { searchKeyOf, titleKey } from "../src/lib/title-key.js";

describe("titleKey", () => {
  it.each([
    ["Shingeki no Kyōjin", "shingeki no kyojin"],
    ["Shingeki-no-Kyoujin", "shingeki no kyojin"],
    ["Kaijuu 8-gou", "kaiju 8 go"],
    ["Re:Zero kara Hajimeru Isekai Seikatsu", "re zero kara hajimeru isekai seikatsu"],
    ["  JUJUTSU   KAISEN ", "jujutsu kaisen"],
    ["名探偵コナン", "名探偵コナン"],
  ])("normalises %s", (input, expected) => {
    expect(titleKey(input)).toBe(expected);
  });

  it("builds one key from every name a title goes by", () => {
    expect(
      searchKeyOf({
        english: "Attack on Titan",
        romaji: "Shingeki no Kyojin",
        native: null,
        synonyms: ["AoT", "SnK"],
      }),
    ).toBe("attack on titan shingeki no kyojin aot snk");
  });
});
