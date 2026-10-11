import type { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";

import { VISITOR_IP_HEADER, WEB_PROXY_SECRET_HEADER } from "../src/lib/client-ip.js";
import type { AppEnv } from "../src/types.js";
import { WEB_ORIGIN, WEB_PROXY_SECRET, mailbox, makeApp, socketFrom } from "./helpers.js";
import { createMember } from "./session.js";
import { type TestDb, createTestDb } from "./test-db.js";

let db: TestDb;
let app: Hono<AppEnv>;

beforeAll(async () => {
  ({ db } = await createTestDb());
  ({ app } = makeApp(db));
});

/**
 * Signs in the way requests arrive in production: through the website's host, whose
 * server (198.51.100.1) reaches us via our own load balancer (10.0.0.5).
 */
async function signInThroughWebsite(email: string, headers: Record<string, string>) {
  const res = await app.request(
    "/api/auth/sign-in/email",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: WEB_ORIGIN,
        "X-Forwarded-For": "198.51.100.1",
        ...headers,
      },
      body: JSON.stringify({ email, password: "a-long-test-password" }),
    },
    socketFrom("10.0.0.5"),
  );
  expect(res.status).toBe(200);
  // The sign-in code email says where the sign-in came from.
  const sent = mailbox.sent.findLast((e) => e.to === email && e.subject.endsWith("sign-in code"));
  return /IP address: (\S+)/.exec(sent?.text ?? "")?.[1];
}

describe("visitors arriving through the website", () => {
  it("are known by the IP the website vouches for, with the shared secret", async () => {
    const { email } = await createMember(app, "Vouched");
    const ip = await signInThroughWebsite(email, {
      [WEB_PROXY_SECRET_HEADER]: WEB_PROXY_SECRET,
      [VISITOR_IP_HEADER]: "203.0.113.77",
    });
    expect(ip).toBe("203.0.113.77");
  });

  it("can't claim an IP without the right secret", async () => {
    const { email } = await createMember(app, "Faker");
    const ip = await signInThroughWebsite(email, {
      [WEB_PROXY_SECRET_HEADER]: "a-guess-that-is-long-enough-but-wrong",
      [VISITOR_IP_HEADER]: "203.0.113.77",
    });
    expect(ip).toBe("198.51.100.1");
  });

  it("ignores an IP that isn't one", async () => {
    const { email } = await createMember(app, "Garbled");
    const ip = await signInThroughWebsite(email, {
      [WEB_PROXY_SECRET_HEADER]: WEB_PROXY_SECRET,
      [VISITOR_IP_HEADER]: "not-an-ip",
    });
    expect(ip).toBe("198.51.100.1");
  });

  it("keeps separate rate limits per visitor, not one for the whole website", async () => {
    // Sign-in allows 3 tries per 10 seconds per visitor.
    const attempt = (visitor: string) =>
      app.request(
        "/api/auth/sign-in/email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: WEB_ORIGIN,
            "X-Forwarded-For": "198.51.100.1",
            [WEB_PROXY_SECRET_HEADER]: WEB_PROXY_SECRET,
            [VISITOR_IP_HEADER]: visitor,
          },
          body: JSON.stringify({ email: "nobody@example.com", password: "wrong-password-123" }),
        },
        socketFrom("10.0.0.5"),
      );
    for (let i = 0; i < 3; i++) await attempt("203.0.113.10");
    expect((await attempt("203.0.113.10")).status).toBe(429);
    // Someone else on the same website isn't blocked.
    expect((await attempt("203.0.113.11")).status).toBe(401);
  });
});
