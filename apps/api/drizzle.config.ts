import { defineConfig } from "drizzle-kit";

// Migrations need a direct connection; the pooled URL is for the running app.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  strict: true,
  verbose: true,
  ...(url && { dbCredentials: { url } }),
});
