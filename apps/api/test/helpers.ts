import type { Hono } from "hono";
import { pino } from "pino";

import { type AppDeps, createApp } from "../src/app.js";
import { createAuth } from "../src/auth.js";
import { createAnilistClient } from "../src/lib/anilist.js";
import { DEFAULT_TRUSTED_PROXIES, createProxyMatcher } from "../src/lib/client-ip.js";
import { memoryMailer } from "../src/lib/email.js";
import { TEST_EMAIL_DOMAIN } from "../src/lib/email-domains.js";
import type { AppEnv } from "../src/types.js";
import { fakeAnilist } from "./fake-anilist.js";
import type { TestDb } from "./test-db.js";

export const WEB_ORIGIN = "http://localhost:3000";
/** Stand-ins for a real university's domains (.example is reserved, RFC 2606). */
export const UNIVERSITY_DOMAINS = ["university.example", "college.example"];
export const GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";

/** Every email the API "sends" during this test file. */
export const mailbox = memoryMailer();

export function makeAuth(db: TestDb, overrides: Partial<Parameters<typeof createAuth>[0]> = {}) {
  return createAuth({
    db,
    baseURL: WEB_ORIGIN,
    secret: "test-secret-that-is-at-least-32-characters-long",
    trustedOrigins: [WEB_ORIGIN],
    google: { clientId: GOOGLE_CLIENT_ID, clientSecret: "test-google-secret" },
    secureCookies: false,
    mailer: mailbox,
    onEmailError: (err) => {
      throw err;
    },
    requireEmailVerification: true,
    // Tests never call Have I Been Pwned; security.test.ts turns it on with a stub.
    checkBreachedPasswords: false,
    timeZone: "Asia/Kolkata",
    allowedEmailDomains: [...UNIVERSITY_DOMAINS, TEST_EMAIL_DOMAIN],
    ...overrides,
  });
}

export function makeApp(
  db: TestDb,
  overrides: Partial<Pick<AppDeps, "pingDatabase" | "anilist" | "auth">> = {},
) {
  const auth = overrides.auth ?? makeAuth(db);
  const app = createApp({
    env: { WEB_ORIGIN, NODE_ENV: "test", CLUB_TIMEZONE: "Asia/Kolkata" },
    logger: pino({ level: "silent" }),
    db,
    auth,
    // Tests never reach the real AniList; pass a fakeAnilist() client to control it.
    anilist: createAnilistClient({ fetch: fakeAnilist().fetch }),
    isTrustedProxy: createProxyMatcher(DEFAULT_TRUSTED_PROXIES),
    pingDatabase: () => Promise.resolve(),
    ...overrides,
  });
  return { app, auth };
}

/** Fakes the TCP socket a request arrived on (what getConnInfo reads). */
export const socketFrom = (address: string) => ({
  incoming: { socket: { remoteAddress: address, remotePort: 50_000, remoteFamily: "IPv4" } },
});

/** The link from the most recent email sent to `to` (optionally matching a subject). */
export function linkFromEmail(to: string, subject?: RegExp): URL {
  const email = mailbox.sent.findLast((e) => e.to === to && (!subject || subject.test(e.subject)));
  const href = email?.text.match(/https?:\/\/\S+/)?.[0];
  if (!href) throw new Error(`no email with a link was sent to ${to}`);
  return new URL(href);
}

/** Opens the confirmation link from the latest verification email, as the member would. */
export function verifyEmail(app: Hono<AppEnv>, to: string, ip = "198.51.100.200") {
  const link = linkFromEmail(to, /Confirm your email/);
  return app.request(`${link.pathname}${link.search}`, {}, socketFrom(ip));
}

/** The code from the latest sign-in code email sent to `to`. */
export function codeFromEmail(to: string): string {
  const email = mailbox.sent.findLast((e) => e.to === to && e.subject.includes("sign-in code"));
  const code = email?.subject.match(/^\d{6}/)?.[0];
  if (!code) throw new Error(`no sign-in code was sent to ${to}`);
  return code;
}

/** Enters the emailed sign-in code, as the member would; returns the response. */
export function enterSignInCode(
  app: Hono<AppEnv>,
  cookie: string,
  email: string,
  ip = "198.51.100.201",
) {
  return app.request(
    "/api/sign-in-code/verify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN, Cookie: cookie },
      body: JSON.stringify({ code: codeFromEmail(email) }),
    },
    socketFrom(ip),
  );
}
