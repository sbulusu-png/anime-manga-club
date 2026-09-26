import { createHash } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ErrorBody } from "../src/lib/errors.js";
import { WEB_ORIGIN, linkFromEmail, makeApp, makeAuth, socketFrom } from "./helpers.js";
import { type TestDb, createTestDb } from "./test-db.js";

let db: TestDb;

beforeAll(async () => {
  ({ db } = await createTestDb());
});

describe("request limits", () => {
  it("rejects bodies over 64 KB before reading them", async () => {
    const { app } = makeApp(db);

    const res = await app.request(
      "/api/reviews",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN },
        body: JSON.stringify({ body: "x".repeat(70_000) }),
      },
      socketFrom("203.0.113.50"),
    );

    expect(res.status).toBe(413);
    expect(((await res.json()) as ErrorBody).error.code).toBe("BODY_TOO_LARGE");
  });

  it("caps each visitor at 300 requests a minute across the whole API", async () => {
    const { app } = makeApp(db);
    const hit = (ip: string) => app.request("/api/health", {}, socketFrom(ip));

    for (let i = 0; i < 300; i++) {
      const res = await hit("203.0.113.60");
      if (res.status !== 200) throw new Error(`request ${i + 1} failed early: ${res.status}`);
    }
    const blocked = await hit("203.0.113.60");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await hit("203.0.113.61")).status).toBe(200); // others unaffected
  });
});

describe("responses", () => {
  it("are never cacheable and forbid framing or loading content", async () => {
    const { app } = makeApp(db);

    const res = await app.request("/api/media");

    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("don't advertise the server software", async () => {
    const { app } = makeApp(db);

    const res = await app.request("/api/health");

    expect(res.headers.get("x-powered-by")).toBeNull();
    expect(res.headers.get("server")).toBeNull();
  });
});

describe("API documentation", () => {
  it("publishes an OpenAPI spec generated from the routes", async () => {
    const { app } = makeApp(db);

    const res = await app.request("/api/openapi.json");
    expect(res.status).toBe(200);
    const spec = (await res.json()) as {
      openapi: string;
      paths: Record<string, Record<string, { tags?: string[]; parameters?: { name: string }[] }>>;
      components: { securitySchemes: Record<string, unknown> };
    };

    expect(spec.openapi).toMatch(/^3\./);
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining([
        "/api/media",
        "/api/media/{id}",
        "/api/reviews/{id}/like",
        "/api/club/suggestions",
      ]),
    );
    // Query parameters come straight from the validation schemas.
    const listParams = spec.paths["/api/media"]?.get?.parameters?.map((p) => p.name);
    expect(listParams).toEqual(expect.arrayContaining(["q", "type", "genre", "sort", "cursor"]));
    expect(spec.paths["/api/reviews"]?.post?.tags).toEqual(["Reviews"]);
    expect(spec.components.securitySchemes).toHaveProperty("session");
    expect(Object.keys(spec.paths).some((path) => path.startsWith("/api/dev"))).toBe(false);
  });

  it("serves an interactive docs page, the only HTML the API returns", async () => {
    const { app } = makeApp(db);

    const res = await app.request("/api/docs");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("/api/openapi.json");
    expect(res.headers.get("content-security-policy")).toContain("https://cdn.jsdelivr.net");
  });

  it("documents the sign-in endpoints too", async () => {
    const { app } = makeApp(db);

    const res = await app.request("/api/auth/open-api/generate-schema");
    expect(res.status).toBe(200);
    const spec = (await res.json()) as { paths: Record<string, unknown> };
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(["/sign-up/email", "/sign-in/email", "/request-password-reset"]),
    );
  });
});

describe("breached passwords", () => {
  const BREACHED = "password123";
  const sha1 = (value: string) => createHash("sha1").update(value).digest("hex").toUpperCase();

  /** Plays Have I Been Pwned: knows one breached password, or is down. */
  function stubPwned(status = 200) {
    const breachedSuffix = sha1(BREACHED).slice(5);
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (!url.startsWith("https://api.pwnedpasswords.com/range/")) return realFetch(input, init);
      const prefix = url.slice(-5);
      const body =
        prefix === sha1(BREACHED).slice(0, 5) ? `${breachedSuffix}:52256179\r\nABC:1` : "ABC:1";
      return Promise.resolve(new Response(status === 200 ? body : "down", { status }));
    });
  }
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  let n = 0;
  function signUp(password: string) {
    n++;
    const { app } = makeApp(db, { auth: makeAuth(db, { checkBreachedPasswords: true }) });
    return app.request(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN },
        body: JSON.stringify({ name: "P", email: `pwned${n}@example.com`, password }),
      },
      socketFrom(`203.0.113.${100 + n}`),
    );
  }

  it("rejects passwords that appear in known breaches", async () => {
    stubPwned();

    const res = await signUp(BREACHED);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "PASSWORD_COMPROMISED" });
  });

  it("accepts passwords that don't", async () => {
    stubPwned();

    expect((await signUp("an-unusual-club-password-9")).status).toBe(200);
  });

  it("refuses to skip the check when the breach service is down", async () => {
    stubPwned(503);

    expect((await signUp("an-unusual-club-password-9")).status).toBe(500);
  });

  it("keeps a reset link usable after rejecting a breached password", async () => {
    stubPwned();
    const { app } = makeApp(db, { auth: makeAuth(db, { checkBreachedPasswords: true }) });
    const email = `pwned-reset@example.com`;
    const post = (path: string, body: unknown) =>
      app.request(
        path,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN },
          body: JSON.stringify(body),
        },
        socketFrom("203.0.113.90"),
      );
    const signedUp = await post("/api/auth/sign-up/email", {
      name: "R",
      email,
      password: "an-unusual-club-password-9",
    });
    expect(signedUp.status).toBe(200);
    await post("/api/auth/request-password-reset", {
      email,
      redirectTo: `${WEB_ORIGIN}/reset-password`,
    });
    const link = linkFromEmail(email, /Reset your/);
    const opened = await app.request(`${link.pathname}${link.search}`);
    const token = new URL(opened.headers.get("location") ?? "").searchParams.get("token");

    const rejected = await post("/api/auth/reset-password", { token, newPassword: BREACHED });
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toMatchObject({ code: "PASSWORD_COMPROMISED" });

    // The member can try again with the same link.
    const reset = await post("/api/auth/reset-password", {
      token,
      newPassword: "another-unusual-password-4",
    });
    expect(reset.status).toBe(200);
  });
});
