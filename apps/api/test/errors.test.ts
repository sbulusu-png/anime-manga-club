import { HTTPException } from "hono/http-exception";
import { beforeAll, describe, expect, it } from "vitest";

import { AppError, type ErrorBody } from "../src/lib/errors.js";
import { makeApp } from "./helpers.js";
import { type TestDb, createTestDb } from "./test-db.js";

async function errorOf(res: Response) {
  return ((await res.json()) as ErrorBody).error;
}

let db: TestDb;
beforeAll(async () => {
  ({ db } = await createTestDb());
});

describe("error handling", () => {
  it("returns a JSON 404 for unknown routes", async () => {
    const res = await makeApp(db).app.request("/api/nope");

    expect(res.status).toBe(404);
    const error = await errorOf(res);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toBe("No route for GET /api/nope");
    expect(error.requestId).toBe(res.headers.get("x-request-id"));
  });

  it("passes AppError status, code and message through", async () => {
    const app = makeApp(db).app;
    app.get("/api/teapot", () => {
      throw new AppError(418, "TEAPOT", "I am a teapot");
    });

    const res = await app.request("/api/teapot");

    expect(res.status).toBe(418);
    expect(await errorOf(res)).toMatchObject({ code: "TEAPOT", message: "I am a teapot" });
  });

  it("maps HTTPException to its status", async () => {
    const app = makeApp(db).app;
    app.get("/api/forbidden", () => {
      throw new HTTPException(403, { message: "Nope" });
    });

    const res = await app.request("/api/forbidden");

    expect(res.status).toBe(403);
    expect(await errorOf(res)).toMatchObject({ code: "HTTP_ERROR", message: "Nope" });
  });

  it("hides the details of unexpected errors", async () => {
    const app = makeApp(db).app;
    app.get("/api/boom", () => {
      throw new Error("database password is hunter2");
    });

    const res = await app.request("/api/boom");

    expect(res.status).toBe(500);
    const error = await errorOf(res);
    expect(error).toMatchObject({ code: "INTERNAL_ERROR", message: "Something went wrong" });
    expect(JSON.stringify(error)).not.toContain("hunter2");
  });
});
