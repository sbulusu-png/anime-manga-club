// Promotes or demotes a user: npm run user:set-role -- <email-or-username> <admin|user>
import { eq, or } from "drizzle-orm";

import { createDb } from "../db/client.js";
import { sessions, users } from "../db/schema/index.js";

const [identifier, role] = process.argv.slice(2);
if (!identifier || (role !== "admin" && role !== "user")) {
  console.error("Usage: npm run user:set-role -- <email-or-username> <admin|user>");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const database = createDb(url);
try {
  const needle = identifier.toLowerCase();
  const [user] = await database.db
    .update(users)
    .set({ role })
    .where(or(eq(users.email, needle), eq(users.username, needle)))
    .returning({ id: users.id, email: users.email, username: users.username });

  if (!user) {
    console.error(`No user with email or username "${identifier}"`);
    process.exitCode = 1;
  } else {
    // Sign them out everywhere so no cached session keeps the old role.
    await database.db.delete(sessions).where(eq(sessions.userId, user.id));
    console.log(`${user.username ?? user.email} is now ${role}. They'll need to sign in again.`);
  }
} finally {
  await database.close();
}
