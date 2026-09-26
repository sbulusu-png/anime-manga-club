import { existsSync } from "node:fs";
import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

// Locally, the same .env as the app (for DATABASE_URL); CI sets the variables itself.
const envFile = join(import.meta.dirname, "../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const CI = Boolean(process.env.CI);
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * End-to-end tests drive the real website and API in a real browser. Locally they reuse
 * the running dev server (`npm run dev`); in CI they start it. Test members are
 * throwaway `e2e-...@example.com` accounts, deleted again in global teardown.
 */
export default defineConfig({
  testDir: "./tests",
  // Accounts are shared across a run, and sign-in is rate-limited per IP, so go one at a time.
  workers: 1,
  fullyParallel: false,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: CI,
  reporter: CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/global-setup.ts",
  globalTeardown: "./tests/global-teardown.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Locally, the Chrome already on this machine; in CI, Playwright's own Chromium.
    ...(CI ? {} : { channel: "chrome" }),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    command: "npm run dev",
    cwd: "../..",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !CI,
    timeout: 180_000,
  },
});
