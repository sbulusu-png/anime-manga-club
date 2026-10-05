// Loads the most popular anime, manga, manhwa and manhua from AniList into `media`.
// Safe to re-run: existing titles are updated in place.
import { sql } from "drizzle-orm";

import { createAnilistClient, toMediaRow } from "../lib/anilist.js";
import { upsertMedia } from "../services/media.js";
import { createDb } from "./client.js";
import { media } from "./schema/index.js";

const PER_TYPE = 50;

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const database = createDb(url);
const anilist = createAnilistClient({ waitOnRateLimit: true });

try {
  // AniList files manhwa (Korea) and manhua (China) under MANGA; ask for them by country.
  const batches = [
    { label: "anime", type: "ANIME", country: undefined },
    { label: "manga", type: "MANGA", country: "JP" },
    { label: "manhwa", type: "MANGA", country: "KR" },
    { label: "manhua", type: "MANGA", country: "CN" },
  ] as const;
  for (const { label, type, country } of batches) {
    const rows = (await anilist.popular(type, 1, PER_TYPE, country)).map(toMediaRow);
    await upsertMedia(database.db, rows);
    console.log(`Seeded ${rows.length} ${label} titles`);
  }

  const [counts] = await database.db
    .select({
      anime: sql<number>`count(*) filter (where ${media.type} = 'anime')::int`,
      manga: sql<number>`count(*) filter (where ${media.type} = 'manga' and coalesce(${media.country}, 'JP') = 'JP')::int`,
      manhwa: sql<number>`count(*) filter (where ${media.country} = 'KR')::int`,
      manhua: sql<number>`count(*) filter (where ${media.country} in ('CN', 'TW', 'HK'))::int`,
    })
    .from(media);
  console.log(
    `media table now holds ${counts?.anime ?? 0} anime, ${counts?.manga ?? 0} manga, ` +
      `${counts?.manhwa ?? 0} manhwa and ${counts?.manhua ?? 0} manhua`,
  );
} finally {
  await database.close();
}
