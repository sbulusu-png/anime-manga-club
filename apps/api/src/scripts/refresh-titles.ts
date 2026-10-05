// Refreshes every title in the catalog from AniList: alternative names (synonyms),
// search keys and the rest. Run after migration 0008: npm run titles:refresh
import { asc, eq } from "drizzle-orm";

import { createDb } from "../db/client.js";
import { media } from "../db/schema/index.js";
import { createAnilistClient, toMediaRow } from "../lib/anilist.js";
import { searchKeyOf } from "../lib/title-key.js";
import { upsertMedia } from "../services/media.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const database = createDb(url);
const anilist = createAnilistClient({ waitOnRateLimit: true, timeoutMs: 20_000 });
try {
  const rows = await database.db
    .select({
      id: media.id,
      anilistId: media.anilistId,
      english: media.titleEnglish,
      romaji: media.titleRomaji,
      native: media.titleNative,
      synonyms: media.synonyms,
    })
    .from(media)
    .orderBy(asc(media.id));

  // 1. Search keys from what we already have, so search works straight away.
  for (const row of rows) {
    await database.db
      .update(media)
      .set({ searchKey: searchKeyOf(row) })
      .where(eq(media.id, row.id));
  }
  console.log(`Search keys set for ${rows.length} titles.`);

  // 2. Synonyms and fresh details from AniList, 50 titles per request.
  let refreshed = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const batch = await anilist.byIds(rows.slice(i, i + 50).map((r) => r.anilistId));
    refreshed += (await upsertMedia(database.db, batch.map(toMediaRow))).length;
    console.log(`Refreshed ${refreshed} of ${rows.length}...`);
    // Stay well inside AniList's rate limit.
    await new Promise((resolve) => setTimeout(resolve, 2_500));
  }
  console.log(`Done: ${refreshed} titles refreshed from AniList.`);
} finally {
  await database.close();
}
