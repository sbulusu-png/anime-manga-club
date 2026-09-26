// Applies pending migrations from drizzle/ without drizzle-kit, so the production image
// can run it on deploy: node dist/scripts/migrate.js
// Uses the same bookkeeping table as `drizzle-kit migrate`, so either can be used.
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDb } from "../db/client.js";

// Migrations need a direct connection; the pooled URL is for the running app.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

// src/scripts (tsx) and dist/scripts (built) are both two levels below the package.
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

const database = createDb(url);
try {
  await migrate(database.db, { migrationsFolder });
  console.log("Migrations are up to date.");
} finally {
  await database.close();
}
