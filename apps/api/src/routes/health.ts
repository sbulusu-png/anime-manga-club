import { Hono } from "hono";
import { describeRoute } from "hono-openapi";

import type { AppEnv } from "../types.js";

export function healthRoutes(pingDatabase: () => Promise<void>) {
  return (
    new Hono<AppEnv>()
      // For the host's health checks and keep-awake pings: answers without touching the
      // database, so frequent checks don't keep the (free, sleep-when-idle) database awake.
      .get(
        "/live",
        describeRoute({ tags: ["System"], summary: "Liveness check (the API only, no database)" }),
        (c) => c.json({ status: "ok", uptimeSeconds: Math.round(process.uptime()) }),
      )
      .get(
        "/",
        describeRoute({ tags: ["System"], summary: "Health check (API and database)" }),
        async (c) => {
          let database: "ok" | "unreachable" = "ok";
          try {
            await pingDatabase();
          } catch (err) {
            database = "unreachable";
            c.get("log").error({ err }, "database health check failed");
          }

          return c.json(
            {
              status: database === "ok" ? "ok" : "degraded",
              database,
              uptimeSeconds: Math.round(process.uptime()),
              timestamp: new Date().toISOString(),
            },
            database === "ok" ? 200 : 503,
          );
        },
      )
  );
}
