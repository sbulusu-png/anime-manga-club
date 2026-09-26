// Loads the most popular anime and manga from AniList into the `media` table.
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
  for (const type of ["ANIME", "MANGA"] as const) {
    const rows = (await anilist.popular(type, 1, PER_TYPE)).map(toMediaRow);
    await upsertMedia(database.db, rows);
    console.log(`Seeded ${rows.length} ${type.toLowerCase()} titles`);
  }

  const [counts] = await database.db
    .select({
      anime: sql<number>`count(*) filter (where ${media.type} = 'anime')::int`,
      manga: sql<number>`count(*) filter (where ${media.type} = 'manga')::int`,
    })
    .from(media);
  console.log(`media table now holds ${counts?.anime ?? 0} anime and ${counts?.manga ?? 0} manga`);
} finally {
  await database.close();
}
