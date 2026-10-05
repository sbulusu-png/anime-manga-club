/**
 * Normalises a title (or a search) so the different ways people spell Japanese names in
 * English letters meet in the middle: "Shingeki no Kyōjin", "shingeki no kyojin" and
 * "Shingeki-no-Kyoujin" all become "shingeki no kyojin".
 *
 * - accents and macrons go (ō -> o), and case;
 * - punctuation becomes spaces ("Re:Zero" -> "re zero");
 * - long vowels written doubled or as "ou" collapse (kaijuu -> kaiju, kyou -> kyo).
 *
 * Titles and queries both go through this, so a quirk on one side is on the other too.
 * Japanese and other scripts are kept as they are.
 */
export function titleKey(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // combining marks: macrons, accents
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/ou|oo/g, "o")
    .replace(/uu/g, "u")
    .replace(/aa/g, "a")
    .replace(/ii/g, "i")
    .replace(/ee/g, "e")
    .replace(/\s+/g, " ")
    .trim();
}

/** Everything a title can be searched by, as one normalised string. */
export function searchKeyOf(titles: {
  english: string | null;
  romaji: string;
  native: string | null;
  synonyms: string[];
}): string {
  return titleKey([titles.english, titles.romaji, titles.native, ...titles.synonyms].join(" | "));
}
