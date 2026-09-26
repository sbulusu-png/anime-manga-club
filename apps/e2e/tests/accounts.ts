import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Account {
  email: string;
  username: string;
  password: string;
  /** Playwright storage state holding this account's signed-in session. */
  storageState: string;
}

export interface Accounts {
  member: Account;
  lead: Account;
}

export const AUTH_DIR = join(import.meta.dirname, "..", ".auth");
export const ACCOUNTS_FILE = join(AUTH_DIR, "accounts.json");
/** Signed-in sessions saved by global setup (fixed paths, so tests can name them early). */
export const MEMBER_STATE = join(AUTH_DIR, "member.json");
export const LEAD_STATE = join(AUTH_DIR, "lead.json");

/** The accounts global setup created for this run. */
export function accounts(): Accounts {
  return JSON.parse(readFileSync(ACCOUNTS_FILE, "utf8")) as Accounts;
}
