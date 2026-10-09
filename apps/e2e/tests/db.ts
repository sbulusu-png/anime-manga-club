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

/**
 * Swaps the sign-in code waiting for this account's sessions for a known one (the real
 * email can't reach example.com). Stored the way the API stores codes: a SHA-256 of
 * "sessionId:code".
 */
export function setSignInCode(email: string, code: string) {
  return withDb((db) =>
    db.query(
      `update sign_in_codes c
          set code_hash = encode(sha256(convert_to(c.session_id || ':' || $2::text, 'UTF8')), 'hex'),
              attempts = 0,
              expires_at = now() + interval '10 minutes'
         from sessions s join users u on u.id = s.user_id
        where s.id = c.session_id and u.email = $1`,
      [email, code],
    ),
  );
}

/** Every test account's email looks like this, so teardown can't touch real members. */
export const E2E_EMAIL_PATTERN = "e2e-%@example.com";
