import { Hono } from "hono";
import { describeRoute } from "hono-openapi";

import type { AppEnv } from "../types.js";

export function healthRoutes(pingDatabase: () => Promise<void>) {
  return new Hono<AppEnv>().get(
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
  );
}
