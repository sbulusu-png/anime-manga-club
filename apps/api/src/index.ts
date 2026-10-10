import { Server as HttpServer } from "node:http";

import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { createAuth } from "./auth.js";
import { createDb } from "./db/client.js";
import { env } from "./env.js";
import { createAnilistClient } from "./lib/anilist.js";
import { createProxyMatcher } from "./lib/client-ip.js";
import { brevoMailer, logMailer, routedMailer } from "./lib/email.js";
import { logger } from "./lib/logger.js";

const database = createDb(env.DATABASE_URL, {
  onIdleError: (err) => {
    logger.warn({ err }, "database connection dropped while idle; the pool will reconnect");
  },
});
const google =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
    : undefined;
if (!google) logger.warn("GOOGLE_CLIENT_ID/SECRET not set: Google sign-in is disabled");

// env.ts guarantees EMAIL_FROM whenever there's a key.
const brevo =
  env.BREVO_API_KEY && env.EMAIL_FROM
    ? brevoMailer({ apiKey: env.BREVO_API_KEY, from: env.EMAIL_FROM })
    : null;
// In development every email is also printed, so sign-in codes can be read from the log
// even when the email can't be delivered.
const mailer = routedMailer({
  deliver: brevo,
  log: logMailer(logger),
  alsoLog: env.NODE_ENV !== "production",
});
if (!brevo) logger.warn("BREVO_API_KEY not set: emails are printed to this log");

const auth = createAuth({
  db: database.db,
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.WEB_ORIGIN, env.BETTER_AUTH_URL],
  google,
  secureCookies: env.BETTER_AUTH_URL.startsWith("https://"),
  mailer,
  onEmailError: (err, email) => {
    logger.error({ err, to: email.to, subject: email.subject }, "email failed to send");
  },
  requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION,
  checkBreachedPasswords: true,
  timeZone: env.CLUB_TIMEZONE,
  allowedEmailDomains: env.ALLOWED_EMAIL_DOMAINS,
});
const app = createApp({
  env,
  logger,
  db: database.db,
  auth,
  anilist: createAnilistClient(),
  isTrustedProxy: createProxyMatcher(env.TRUSTED_PROXIES),
  pingDatabase: database.ping,
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info(`API listening on http://localhost:${info.port}`);
});

// Keep idle connections open longer than the website's proxy does (Node's default is
// 5s on both sides). Otherwise the proxy can reuse a connection just as the API closes
// it, and that request fails with ECONNRESET ("Failed to proxy"), at random.
if (server instanceof HttpServer) {
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
}

async function closeDatabaseAndExit(serverError?: Error) {
  let code = 0;
  if (serverError) {
    logger.error({ err: serverError }, "error closing HTTP server");
    code = 1;
  }
  try {
    await database.close();
  } catch (err) {
    logger.error({ err }, "error closing database pool");
    code = 1;
  }
  process.exit(code);
}

function shutdown(signal: NodeJS.Signals) {
  logger.info(`${signal} received, shutting down`);
  server.close((err) => void closeDatabaseAndExit(err));
  // Don't hang forever on keep-alive connections.
  setTimeout(() => process.exit(1), 10_000).unref();
}

// Log anything that escapes a request handler instead of dying silently.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaught exception, shutting down");
  process.exitCode = 1;
  shutdown("SIGTERM");
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
