import { createMiddleware } from "hono/factory";

import type { AppEnv } from "../types.js";
import type { Logger } from "../lib/logger.js";

/** Attaches a per-request child logger and logs one line when each request finishes. */
export function requestLogger(logger: Logger) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const start = performance.now();
    const log = logger.child({ requestId: c.get("requestId") });
    c.set("log", log);

    await next();

    const status = c.res.status;
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    log[level](
      {
        method: c.req.method,
        path: c.req.path,
        status,
        durationMs: Math.round(performance.now() - start),
      },
      "request completed",
    );
  });
}
