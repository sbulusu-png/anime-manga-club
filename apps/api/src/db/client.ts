import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";

import * as schema from "./schema/index.js";

export const DB_CASING = "snake_case";

export interface CreateDbOptions {
  /**
   * Called when an idle pooled connection dies (Neon closes idle connections and
   * suspends the database when it's quiet). The pool drops that connection and opens a
   * new one on the next query, so this only needs logging.
   */
  onIdleError?: (err: Error) => void;
}

export function createDb(connectionString: string, options: CreateDbOptions = {}) {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // Without a listener, Node treats the pool's "error" event as an uncaught exception
  // and the whole API would shut down the first time the database dropped an idle
  // connection.
  pool.on(
    "error",
    options.onIdleError ??
      ((err) => {
        console.warn("database connection dropped while idle:", err.message);
      }),
  );
  const db = drizzle({ client: pool, schema, casing: DB_CASING });

  return {
    db,
    /** The underlying node-postgres pool (for tests and shutdown). */
    pool,
    /** Resolves if the database answers a trivial query. */
    ping: async () => {
      await db.execute(sql`select 1`);
    },
    close: () => pool.end(),
  };
}

/** Any Drizzle Postgres database with our schema: node-postgres in the app, PGlite in tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
