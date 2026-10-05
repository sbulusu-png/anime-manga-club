import { mkdirSync, writeFileSync } from "node:fs";

import { type FullConfig, request } from "@playwright/test";

import {
  ACCOUNTS_FILE,
  AUTH_DIR,
  type Account,
  type Accounts,
  LEAD_STATE,
  MEMBER_STATE,
} from "./accounts";
import { withDb } from "./db";
import globalTeardown from "./global-teardown";

// Sign-in allows 3 tries per 10 seconds per IP; every request here shares one IP.
const RATE_WINDOW_MS = 10_500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A small catalog for an empty database (CI); a real one already has titles. */
async function ensureCatalog() {
  await withDb(async (db) => {
    const { rows } = await db.query<{ count: number }>("select count(*)::int as count from media");
    if ((rows[0]?.count ?? 0) > 0) return;
    await db.query(`
      insert into media (anilist_id, type, format, status, title_romaji, title_english, genres, tags,
                         episodes, popularity, anilist_score, season, season_year, synopsis)
      values
        (990000001, 'anime', 'TV', 'FINISHED', 'E2E Blade Quest', 'E2E Blade Quest',
         '{Action,Adventure}', '{Swordplay,Travel}', 12, 5000, 85, 'SPRING', 2024,
         'A test anime about a travelling swordsman.'),
        (990000002, 'anime', 'TV', 'FINISHED', 'E2E Quiet Farm', 'E2E Quiet Farm',
         '{"Slice of Life"}', '{Agriculture}', 10, 3000, 78, 'FALL', 2023,
         'A test anime about a peaceful farm.'),
        (990000003, 'manga', 'MANGA', 'RELEASING', 'E2E Ink Hearts', 'E2E Ink Hearts',
         '{Romance,Drama}', '{School}', null, 2000, 80, null, 2022,
         'A test manga about two rival artists.')
    `);
  });
}

async function createAccount(
  baseURL: string,
  role: "user" | "admin",
  tag: string,
  storageState: string,
): Promise<Account> {
  const id = `${tag}_${Math.random().toString(36).slice(2, 8)}`;
  const account: Account = {
    email: `e2e-${id}@example.com`,
    username: `e2e_${id}`,
    password: `e2e ${id} lantern harbour tide`,
    storageState,
  };
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });

  const signUp = await api.post("/api/auth/sign-up/email", {
    data: {
      name: account.username,
      email: account.email,
      password: account.password,
      username: account.username,
      displayUsername: account.username,
    },
  });
  if (!signUp.ok())
    throw new Error(`sign-up failed: ${String(signUp.status())} ${await signUp.text()}`);

  // The confirmation email can't reach example.com, so confirm (and promote) directly.
  await withDb((db) =>
    db.query("update users set email_verified = true, role = $2 where email = $1", [
      account.email,
      role,
    ]),
  );

  const signIn = await api.post("/api/auth/sign-in/email", {
    data: { email: account.email, password: account.password },
  });
  if (!signIn.ok())
    throw new Error(`sign-in failed: ${String(signIn.status())} ${await signIn.text()}`);
  await api.storageState({ path: account.storageState });
  await api.dispose();
  return account;
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:3000";
  // Clear anything an interrupted earlier run left behind (it couldn't tear down), so
  // tests only ever see this run's accounts.
  await globalTeardown();
  mkdirSync(AUTH_DIR, { recursive: true });
  await ensureCatalog();

  const member = await createAccount(baseURL, "user", "member", MEMBER_STATE);
  await sleep(RATE_WINDOW_MS);
  const lead = await createAccount(baseURL, "admin", "lead", LEAD_STATE);
  // Leave the rate-limit window clear for the sign-in tests.
  await sleep(RATE_WINDOW_MS);

  const accounts: Accounts = { member, lead };
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}
