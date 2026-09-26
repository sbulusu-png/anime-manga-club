import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import { resolveClientIp } from "../lib/client-ip.js";
import { AppError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

interface RateLimitOptions {
  /** Name of the bucket, so separate limits don't share counters. */
  name: string;
  windowMs: number;
  max: number;
  isTrustedProxy: (ip: string) => boolean;
  /** Who a request counts against; defaults to the client IP. Return undefined to use the IP. */
  keyBy?: (c: Context<AppEnv>) => string | undefined;
}

/**
 * Fixed-window limit per client IP, kept in memory (fine for a single API instance;
 * move to Redis or Postgres if we ever run several).
 */
export function rateLimit({ name, windowMs, max, isTrustedProxy, keyBy }: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  function clientIp(c: Context<AppEnv>) {
    let peer: string | undefined;
    try {
      peer = getConnInfo(c).remote.address;
    } catch {
      // No socket (in-process tests).
    }
    return resolveClientIp(peer, c.req.header("x-forwarded-for"), isTrustedProxy) ?? "unknown";
  }

  return createMiddleware<AppEnv>(async (c, next) => {
    const key = `${name}|${keyBy?.(c) ?? clientIp(c)}`;
    const now = Date.now();

    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
    }
    const entry = hits.get(key);
    if (!entry || now >= entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
    } else if (entry.count >= max) {
      c.header("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      throw new AppError(429, "RATE_LIMITED", "Too many requests. Please slow down.");
    } else {
      entry.count++;
    }
    await next();
  });
}
