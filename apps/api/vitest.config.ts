import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    // Each file boots its own in-memory Postgres (~150 MB). Half the cores keeps peak
    // memory reasonable on laptops; the timeout allows for a busy machine.
    maxWorkers: "50%",
    hookTimeout: 30_000,
    // Tests never touch a real database or Google; these only satisfy env validation.
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
    },
  },
});
