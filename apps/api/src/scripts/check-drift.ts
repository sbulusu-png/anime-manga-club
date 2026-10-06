// Fails if the Drizzle schema and the committed migrations disagree. Run after
// `drizzle-kit generate` (see the db:check-drift script): any new or changed file under
// drizzle/ means the schema changed without a migration. Plain Node, so it works on
// Windows as well as CI.
import { execFileSync } from "node:child_process";

const changes = execFileSync("git", ["status", "--porcelain", "--", "drizzle"], {
  encoding: "utf8",
}).trim();

if (changes) {
  console.error(`Schema and migrations differ. Generate a migration for:\n${changes}`);
  process.exit(1);
}
console.log("No drift: the schema and migrations agree.");
