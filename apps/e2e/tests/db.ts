import pg from "pg";

/**
 * Direct database access for test setup only: confirming test members' emails (the
 * real confirmation email can't reach example.com) and cleaning up afterwards.
 */
export async function withDb<T>(run: (db: pg.Client) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("E2E tests need DATABASE_URL (they load ../../.env)");
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    return await run(db);
  } finally {
    await db.end();
  }
}

/** Every test account's email looks like this, so teardown can't touch real members. */
export const E2E_EMAIL_PATTERN = "e2e-%@example.com";
