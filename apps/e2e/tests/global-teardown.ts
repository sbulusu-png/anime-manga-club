import { rmSync } from "node:fs";

import { AUTH_DIR } from "./accounts";
import { E2E_EMAIL_PATTERN, withDb } from "./db";

/** Deletes every test account (and what they made) and the test catalog, if any. */
export default async function globalTeardown() {
  await withDb(async (db) => {
    // Club picks outlive their author on purpose, so remove test leads' picks first.
    await db.query(
      "delete from club_suggestions where suggested_by_id in (select id from users where email like $1)",
      [E2E_EMAIL_PATTERN],
    );
    // Club verdicts also outlive the lead who gave them, so undo test leads' verdicts.
    await db.query(
      `update media set club_verdict = null, club_verdict_by_id = null, club_verdict_at = null
        where club_verdict_by_id in (select id from users where email like $1)`,
      [E2E_EMAIL_PATTERN],
    );
    // Reviews, likes and lists go with the account (cascades keep the club counts right).
    await db.query("delete from users where email like $1", [E2E_EMAIL_PATTERN]);
    await db.query("delete from media where anilist_id >= 990000000");
  });
  rmSync(AUTH_DIR, { recursive: true, force: true });
}
