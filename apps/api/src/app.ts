import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";
import { openAPIRouteHandler } from "hono-openapi";

import type { Auth } from "./auth.js";
import type { Db } from "./db/client.js";
import type { Env } from "./env.js";
import type { AnilistClient } from "./lib/anilist.js";
import { withClientIp } from "./lib/client-ip.js";
import { AppError, type ErrorBody } from "./lib/errors.js";
import type { Logger } from "./lib/logger.js";
import { loadSession } from "./middleware/auth.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { requestLogger } from "./middleware/request-logger.js";
import { clubRoutes } from "./routes/club.js";
import { devRoutes } from "./routes/dev.js";
import { healthRoutes } from "./routes/health.js";
import { listRoutes } from "./routes/list.js";
import { mediaRoutes } from "./routes/media.js";
import { meRoutes } from "./routes/me.js";
import { recommendationRoutes } from "./routes/recommendations.js";
import { reviewRoutes } from "./routes/reviews.js";
import { signInCodeRoutes } from "./routes/sign-in-code.js";
import { userRoutes } from "./routes/users.js";
import type { AppEnv } from "./types.js";

export interface AppDeps {
  env: Pick<Env, "WEB_ORIGIN" | "NODE_ENV" | "CLUB_TIMEZONE">;
  logger: Logger;
  db: Db;
  auth: Auth;
  anilist: AnilistClient;
  isTrustedProxy: (ip: string) => boolean;
  pingDatabase: () => Promise<void>;
}

export function createApp(deps: AppDeps) {
  const { env, logger, db, auth, anilist, isTrustedProxy, pingDatabase } = deps;
  const app = new Hono<AppEnv>();

  app.use(requestId());
  app.use(requestLogger(logger));
  // The API only ever returns JSON: forbid browsers from loading or framing anything.
  // The one HTML page, /api/docs, may load the Scalar viewer from its CDN.
  const jsonHeaders = secureHeaders({
    contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    xFrameOptions: "DENY",
  });
  const docsHeaders = secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https:", "data:"],
      imgSrc: ["'self'", "https:", "data:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
    xFrameOptions: "DENY",
  });
  app.use((c, next) => (c.req.path === "/api/docs" ? docsHeaders(c, next) : jsonHeaders(c, next)));
  // Responses can hold a member's private data; never let a proxy or browser cache keep them.
  app.use(async (c, next) => {
    await next();
    if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
  });
  app.use(
    "/api/*",
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );
  // Overall per-visitor ceiling, on top of the stricter per-feature limits.
  app.use("/api/*", rateLimit({ name: "global", windowMs: 60_000, max: 300, isTrustedProxy }));
  // The largest legitimate body is a 10,000-character review (~20 KB of JSON).
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 64 * 1024,
      onError: () => {
        throw new AppError(413, "BODY_TOO_LARGE", "That request is too large.");
      },
    }),
  );
  app.use(
    "/api/*",
    timeout(30_000, () => new HTTPException(503, { message: "The request took too long." })),
  );

  // Better Auth owns everything under /api/auth (sign-up, sign-in, Google, sessions).
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(withClientIp(c, isTrustedProxy)));

  // Health is registered before the session loader so it works even when sessions can't load.
  app.route("/api/health", healthRoutes(pingDatabase));
  app.use("/api/*", loadSession(auth));
  app.route("/api/me", meRoutes);
  app.route("/api/sign-in-code", signInCodeRoutes({ db, auth, isTrustedProxy }));
  app.route("/api/media", mediaRoutes({ db, anilist, isTrustedProxy }));
  app.route("/api/reviews", reviewRoutes({ db, isTrustedProxy }));
  app.route("/api/list", listRoutes({ db, anilist, isTrustedProxy }));
  app.route("/api/users", userRoutes({ db }));
  app.route("/api/club", clubRoutes({ db, timeZone: env.CLUB_TIMEZONE }));
  app.route("/api/recommendations", recommendationRoutes({ db }));
  if (env.NODE_ENV === "development") app.route("/api/dev", devRoutes(auth));

  // API documentation, generated from the routes' own validation schemas.
  app.get(
    "/api/openapi.json",
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "Anime Manga Club API",
          version: "1.0.0",
          description:
            "Reviews, lists and suggestions for the club. Sign-in endpoints live under " +
            "/api/auth and are documented separately (see the sources menu on /api/docs).",
        },
        servers: [{ url: env.WEB_ORIGIN, description: "Through the website (same origin)" }],
        components: {
          securitySchemes: {
            session: { type: "apiKey", in: "cookie", name: "amc.session_token" },
          },
        },
      },
    }),
  );
  app.get(
    "/api/docs",
    Scalar({
      pageTitle: "Anime Manga Club API",
      sources: [
        { title: "Club API", url: "/api/openapi.json" },
        { title: "Sign-in (Better Auth)", url: "/api/auth/open-api/generate-schema" },
      ],
    }),
  );

  app.notFound((c) =>
    c.json<ErrorBody>(
      {
        error: {
          code: "NOT_FOUND",
          message: `No route for ${c.req.method} ${c.req.path}`,
          requestId: c.get("requestId"),
        },
      },
      404,
    ),
  );

  app.onError((err, c) => {
    const requestId = c.get("requestId");

    if (err instanceof AppError) {
      return c.json<ErrorBody>(
        { error: { code: err.code, message: err.message, requestId } },
        err.status,
      );
    }

    if (err instanceof HTTPException) {
      return c.json<ErrorBody>(
        { error: { code: "HTTP_ERROR", message: err.message || "Request failed", requestId } },
        err.status,
      );
    }

    // Unexpected: log the details, but never leak them to the client.
    c.get("log").error({ err }, "unhandled error");
    return c.json<ErrorBody>(
      { error: { code: "INTERNAL_ERROR", message: "Something went wrong", requestId } },
      500,
    );
  });

  return app;
}
