import { describe, expect, it } from "vitest";

import {
  DEFAULT_TRUSTED_PROXIES,
  createProxyMatcher,
  resolveClientIp,
} from "../src/lib/client-ip.js";

const trusted = createProxyMatcher(DEFAULT_TRUSTED_PROXIES);

describe("resolveClientIp", () => {
  it.each([
    ["a direct visitor", "203.0.113.5", undefined, "203.0.113.5"],
    ["a visitor who fakes X-Forwarded-For", "203.0.113.5", "1.1.1.1", "203.0.113.5"],
    ["a visitor behind our proxy", "10.0.0.5", "198.51.100.9", "198.51.100.9"],
    ["a visitor behind two proxies", "127.0.0.1", "198.51.100.9, 10.1.2.3", "198.51.100.9"],
    ["a faked hop behind our proxy", "10.0.0.5", "6.6.6.6, 198.51.100.9", "198.51.100.9"],
    ["a local request (all hops trusted)", "::1", undefined, "::1"],
    ["a local request through the local proxy", "127.0.0.1", "::ffff:127.0.0.1", "127.0.0.1"],
    ["an IPv4-mapped IPv6 peer", "::ffff:203.0.113.5", undefined, "203.0.113.5"],
  ])("finds %s", (_case, peer, forwardedFor, expected) => {
    expect(resolveClientIp(peer, forwardedFor, trusted)).toBe(expected);
  });

  it("gives up on a garbage hop instead of guessing", () => {
    expect(resolveClientIp("10.0.0.5", "not-an-ip", trusted)).toBeNull();
  });

  it("returns null with nothing to go on", () => {
    expect(resolveClientIp(undefined, undefined, trusted)).toBeNull();
  });
});

describe("createProxyMatcher", () => {
  it("matches addresses inside the configured ranges", () => {
    expect(trusted("10.255.0.1")).toBe(true);
    expect(trusted("172.20.1.1")).toBe(true);
    expect(trusted("172.32.0.1")).toBe(false);
    expect(trusted("fd00::1")).toBe(true);
    expect(trusted("8.8.8.8")).toBe(false);
    expect(trusted("nonsense")).toBe(false);
  });

  it.each(["banana", "10.0.0.0/33", "10.0.0.0/x", "::/129"])("rejects %s", (entry) => {
    expect(() => createProxyMatcher([entry])).toThrow(/Invalid trusted proxy/);
  });
});
