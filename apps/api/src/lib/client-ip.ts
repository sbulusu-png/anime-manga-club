import { createHash, timingSafeEqual } from "node:crypto";
import { BlockList, isIP } from "node:net";

import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import type { AppEnv } from "../types.js";

/** Private and loopback ranges: the website's proxy and the host's load balancer. */
export const DEFAULT_TRUSTED_PROXIES = [
  "127.0.0.0/8",
  "::1/128",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "fc00::/7",
];

/**
 * Header carrying the client IP we resolved. Better Auth reads only this one;
 * any value a client sends is overwritten before the request reaches it.
 */
export const CLIENT_IP_HEADER = "x-amc-client-ip";

/**
 * Headers the website adds to every request it forwards here (apps/web/src/lib/visitor.ts):
 * a shared secret, and the visitor's IP as the website's host saw it.
 */
export const WEB_PROXY_SECRET_HEADER = "x-amc-proxy-secret";
export const VISITOR_IP_HEADER = "x-amc-visitor-ip";

/** Strips IPv4-mapped IPv6 (`::ffff:1.2.3.4`) down to plain IPv4. */
function normalize(ip: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  return mapped?.[1] ?? ip;
}

/** Builds a matcher for IPs/CIDRs; throws on an invalid entry so config mistakes fail fast. */
export function createProxyMatcher(entries: string[]) {
  const list = new BlockList();
  for (const entry of entries) {
    const [address = "", prefixText] = entry.split("/");
    const family = isIP(address);
    if (!family) throw new Error(`Invalid trusted proxy "${entry}"`);
    const type = family === 4 ? "ipv4" : "ipv6";
    if (prefixText === undefined) {
      list.addAddress(address, type);
    } else {
      const prefix = Number(prefixText);
      if (!/^\d+$/.test(prefixText) || prefix > (family === 4 ? 32 : 128)) {
        throw new Error(`Invalid trusted proxy "${entry}"`);
      }
      list.addSubnet(address, prefix, type);
    }
  }
  return (ip: string) => {
    const family = isIP(ip);
    return family !== 0 && list.check(ip, family === 4 ? "ipv4" : "ipv6");
  };
}

/**
 * Resolves the real client IP from the socket peer plus X-Forwarded-For, walking
 * from the right and skipping trusted proxies. If every hop is trusted (e.g. a
 * local request), the leftmost hop is the client. Returns null if the chain
 * contains something that isn't an IP address.
 */
export function resolveClientIp(
  peer: string | undefined,
  forwardedFor: string | undefined,
  isTrustedProxy: (ip: string) => boolean,
): string | null {
  const chain = [...(forwardedFor ?? "").split(","), peer ?? ""]
    .map((hop) => normalize(hop.trim()))
    .filter(Boolean);

  for (let i = chain.length - 1; i >= 0; i--) {
    const hop = chain[i] ?? "";
    if (!isIP(hop)) return null;
    // Only trust what a trusted proxy told us: the first untrusted hop is the client.
    if (!isTrustedProxy(hop) || i === 0) return hop;
  }
  return null;
}

const sha256 = (value: string) => createHash("sha256").update(value).digest();

/**
 * Behind the website's host (Vercel), every request reaches us from the host's servers,
 * so the socket and X-Forwarded-For only name those. The website therefore sends the
 * visitor's IP itself, with a shared secret; only then is it believed. Anyone else
 * (including a request straight to the API) is judged by their own address as usual.
 */
export function websiteVisitor(secret: string | undefined) {
  const expected = secret ? sha256(secret) : null;
  return createMiddleware<AppEnv>(async (c, next) => {
    const given = c.req.header(WEB_PROXY_SECRET_HEADER);
    const ip = normalize(c.req.header(VISITOR_IP_HEADER)?.trim() ?? "");
    // Compared as hashes, so the comparison takes the same time whatever was sent.
    if (expected && given && timingSafeEqual(expected, sha256(given)) && isIP(ip)) {
      c.set("visitorIp", ip);
    }
    await next();
  });
}

/** The client's IP: the one the website vouched for, or else worked out from the hops. */
export function clientIpOf(
  c: Context<AppEnv>,
  isTrustedProxy: (ip: string) => boolean,
): string | null {
  return (
    c.get("visitorIp") ??
    resolveClientIp(socketPeer(c), c.req.header("x-forwarded-for"), isTrustedProxy)
  );
}

function socketPeer(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined; // No socket (in-process tests).
  }
}

/**
 * Copies the request, replacing CLIENT_IP_HEADER with the resolved client IP (and
 * dropping the website's secret, which Better Auth has no use for).
 */
export function withClientIp(c: Context<AppEnv>, isTrustedProxy: (ip: string) => boolean): Request {
  const headers = new Headers(c.req.raw.headers);
  headers.delete(CLIENT_IP_HEADER);
  headers.delete(WEB_PROXY_SECRET_HEADER);
  headers.delete(VISITOR_IP_HEADER);
  const ip = clientIpOf(c, isTrustedProxy);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);
  return new Request(c.req.raw, { headers });
}
