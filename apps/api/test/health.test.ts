import { beforeAll, describe, expect, it, vi } from "vitest";

import { makeApp } from "./helpers.js";
import { type TestDb, createTestDb } from "./test-db.js";

let db: TestDb;
beforeAll(async () => {
  ({ db } = await createTestDb());
});

describe("GET /api/health", () => {
  it("reports ok", async () => {
    const res = await makeApp(db).app.request("/api/health");

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body.database).toBe("ok");
    expect(body.uptimeSeconds).toEqual(expect.any(Number));
    expect(new Date(body.timestamp as string).toString()).not.toBe("Invalid Date");
  });

  it("reports degraded with 503 when the database is unreachable", async () => {
    const { app } = makeApp(db, {
      pingDatabase: () => Promise.reject(new Error("connection refused")),
    });

    const res = await app.request("/api/health");

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: "degraded", database: "unreachable" });
  });

  it("tags every response with a request id", async () => {
    const res = await makeApp(db).app.request("/api/health");

    expect(res.headers.get("x-request-id")).toMatch(/.+/);
  });

  it("sends security headers", async () => {
    const res = await makeApp(db).app.request("/api/health");

    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("GET /api/health with a broken session store", () => {
  it("still answers, even when the request carries a session cookie", async () => {
    const { app, auth } = makeApp(db);
    vi.spyOn(auth.api, "getSession").mockRejectedValue(new Error("database is down"));

    const res = await app.request("/api/health", {
      headers: { Cookie: "amc.session_token=anything" },
    });

    expect(res.status).toBe(200);
  });
});
