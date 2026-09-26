import { describe, expect, it, vi } from "vitest";

import { createDb } from "../src/db/client.js";

describe("database pool", () => {
  // Neon closes idle connections and suspends the database when it's quiet; node-postgres
  // then emits "error" on the pool. Unhandled, that event crashes the whole process.
  it("survives an idle connection being dropped, and reports it", async () => {
    const onIdleError = vi.fn();
    // Nothing connects until the first query, so no database is needed here.
    const { pool, close } = createDb("postgresql://user:secret@127.0.0.1:1/none", { onIdleError });
    const dropped = new Error("Connection terminated unexpectedly");

    expect(() => pool.emit("error", dropped)).not.toThrow();
    expect(onIdleError).toHaveBeenCalledWith(dropped);
    await close();
  });

  it("has a safe default when no handler is given", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { pool, close } = createDb("postgresql://user:secret@127.0.0.1:1/none");

    expect(() => pool.emit("error", new Error("Connection terminated unexpectedly"))).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    await close();
  });
});
