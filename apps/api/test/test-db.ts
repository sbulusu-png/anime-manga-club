import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { inject } from "vitest";

import { DB_CASING } from "../src/db/client.js";
import * as schema from "../src/db/schema/index.js";

/** A fresh in-memory Postgres with every migration applied (see global-setup.ts). */
export async function createTestDb() {
  const snapshot = new Blob([Buffer.from(inject("migratedDbSnapshot"), "base64")]);
  const client = new PGlite({ extensions: { pg_trgm }, loadDataDir: snapshot });
  await client.waitReady;
  const db = drizzle({ client, schema, casing: DB_CASING });
  return { client, db };
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>["db"];
