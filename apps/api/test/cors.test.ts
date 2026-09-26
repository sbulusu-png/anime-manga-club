import { beforeAll, describe, expect, it } from "vitest";

import { WEB_ORIGIN, makeApp } from "./helpers.js";
import { type TestDb, createTestDb } from "./test-db.js";

let db: TestDb;
beforeAll(async () => {
  ({ db } = await createTestDb());
});

describe("CORS", () => {
  it("allows the web app origin with credentials", async () => {
    const res = await makeApp(db).app.request("/api/health", { headers: { Origin: WEB_ORIGIN } });

    expect(res.headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("does not allow other origins", async () => {
    const res = await makeApp(db).app.request("/api/health", {
      headers: { Origin: "https://evil.example" },
    });

    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers preflight requests", async () => {
    const res = await makeApp(db).app.request("/api/health", {
      method: "OPTIONS",
      headers: { Origin: WEB_ORIGIN, "Access-Control-Request-Method": "POST" },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });
});
