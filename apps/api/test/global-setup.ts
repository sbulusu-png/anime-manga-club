// Runs once before all test files: builds a fully migrated database and shares a
// snapshot of it, so each test file loads it instead of re-running migrations.
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { TestProject } from "vitest/node";

import { DB_CASING } from "../src/db/client.js";
import * as schema from "../src/db/schema/index.js";

declare module "vitest" {
  export interface ProvidedContext {
    /** Base64 gzip tarball of a migrated PGlite data directory. */
    migratedDbSnapshot: string;
  }
}

export default async function setup(project: TestProject) {
  const client = new PGlite({ extensions: { pg_trgm } });
  await migrate(drizzle({ client, schema, casing: DB_CASING }), { migrationsFolder: "./drizzle" });
  const dump = await client.dumpDataDir("gzip");
  await client.close();
  project.provide("migratedDbSnapshot", Buffer.from(await dump.arrayBuffer()).toString("base64"));
}
