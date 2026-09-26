import { describe, expect, it } from "vitest";

import { parseEnv } from "../src/env.js";
import { DEFAULT_TRUSTED_PROXIES } from "../src/lib/client-ip.js";

const required = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db?sslmode=verify-full",
  BETTER_AUTH_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("applies defaults", () => {
    expect(parseEnv(required)).toEqual({
      NODE_ENV: "development",
      PORT: 4000,
      LOG_LEVEL: "info",
      WEB_ORIGIN: "http://localhost:3000",
      BETTER_AUTH_URL: "http://localhost:3000",
      CLUB_TIMEZONE: "Asia/Kolkata",
      EMAIL_FROM: "Anime Manga Club <onboarding@resend.dev>",
      REQUIRE_EMAIL_VERIFICATION: true,
      TRUSTED_PROXIES: DEFAULT_TRUSTED_PROXIES,
      ...required,
    });
  });

  it("prefers API_PORT over PORT", () => {
    expect(parseEnv({ ...required, PORT: "3000", API_PORT: "4000" }).PORT).toBe(4000);
    expect(parseEnv({ ...required, PORT: "8080" }).PORT).toBe(8080);
  });

  it("coerces PORT from a string", () => {
    expect(parseEnv({ ...required, PORT: "8080" }).PORT).toBe(8080);
  });

  it("requires a postgres DATABASE_URL", () => {
    expect(() => parseEnv({ ...required, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ ...required, DATABASE_URL: "mysql://localhost/db" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("requires a long BETTER_AUTH_SECRET", () => {
    expect(() => parseEnv({ ...required, BETTER_AUTH_SECRET: "short" })).toThrow(
      /32 characters[\s\S]*BETTER_AUTH_SECRET/,
    );
  });

  it("treats blank Google credentials as unset", () => {
    const env = parseEnv({ ...required, GOOGLE_CLIENT_ID: " ", GOOGLE_CLIENT_SECRET: "" });
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined();
  });

  it("needs both Google credentials or neither", () => {
    expect(() => parseEnv({ ...required, GOOGLE_CLIENT_ID: "id-only" })).toThrow(
      /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/,
    );
  });

  it("parses a comma-separated TRUSTED_PROXIES list", () => {
    expect(
      parseEnv({ ...required, TRUSTED_PROXIES: "10.0.0.0/8, 100.64.0.0/10" }).TRUSTED_PROXIES,
    ).toEqual(["10.0.0.0/8", "100.64.0.0/10"]);
  });

  it("requires a Resend key in production, but not in development", () => {
    expect(() => parseEnv({ ...required, NODE_ENV: "production" })).toThrow(/RESEND_API_KEY/);
    const production = parseEnv({ ...required, NODE_ENV: "production", RESEND_API_KEY: "re_1" });
    expect(production.NODE_ENV).toBe("production");
  });

  it("can switch email verification off", () => {
    const env = parseEnv({ ...required, REQUIRE_EMAIL_VERIFICATION: "false" });
    expect(env.REQUIRE_EMAIL_VERIFICATION).toBe(false);
  });

  it("rejects unknown timezones", () => {
    expect(() => parseEnv({ ...required, CLUB_TIMEZONE: "Mars/Olympus_Mons" })).toThrow(
      /IANA timezone/,
    );
  });

  it("rejects invalid TRUSTED_PROXIES entries", () => {
    expect(() => parseEnv({ ...required, TRUSTED_PROXIES: "10.0.0.0/8, oops" })).toThrow(
      /Invalid trusted proxy "oops"/,
    );
  });

  it("rejects invalid values with a readable message", () => {
    expect(() => parseEnv({ ...required, PORT: "not-a-port", WEB_ORIGIN: "nope" })).toThrow(
      /Invalid environment variables:[\s\S]*PORT[\s\S]*WEB_ORIGIN/,
    );
  });
});
