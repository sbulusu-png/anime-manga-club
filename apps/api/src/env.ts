import { z } from "zod";

import { DEFAULT_TRUSTED_PROXIES, createProxyMatcher } from "./lib/client-ip.js";

const optionalString = z
  .string()
  .trim()
  .transform((value) => value || undefined)
  .optional();

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
    /** Public origin of the site; the web app proxies /api here. */
    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
    /** Club weeks (for weekly suggestions) start on Monday in this timezone. */
    CLUB_TIMEZONE: z
      .string()
      .default("Asia/Kolkata")
      .refine((zone) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: zone });
          return true;
        } catch {
          return false;
        }
      }, "must be an IANA timezone like Asia/Kolkata"),
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    /** Sends email (verification, password reset). Required in production. */
    RESEND_API_KEY: optionalString,
    EMAIL_FROM: z.string().trim().min(3).default("Anime Manga Club <onboarding@resend.dev>"),
    REQUIRE_EMAIL_VERIFICATION: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    TRUSTED_PROXIES: z
      .string()
      .optional()
      .transform((value) =>
        value
          ? value
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean)
          : DEFAULT_TRUSTED_PROXIES,
      )
      .superRefine((entries, ctx) => {
        try {
          createProxyMatcher(entries);
        } catch (err) {
          ctx.addIssue({ code: "custom", message: (err as Error).message });
        }
      }),
  })
  .refine((env) => Boolean(env.GOOGLE_CLIENT_ID) === Boolean(env.GOOGLE_CLIENT_SECRET), {
    message: "set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither",
    path: ["GOOGLE_CLIENT_SECRET"],
  })
  .refine((env) => env.NODE_ENV !== "production" || Boolean(env.RESEND_API_KEY), {
    message: "is required in production (emails would silently go nowhere)",
    path: ["RESEND_API_KEY"],
  });

export type Env = z.infer<typeof envSchema>;

/** Validates environment variables, failing fast with a readable list of problems. */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // API_PORT wins over PORT: when the API and website run together (npm run dev), PORT
  // may be meant for the website. Hosting platforms set PORT per service, which still works.
  const result = envSchema.safeParse({ ...source, PORT: source.API_PORT ?? source.PORT });
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const env = parseEnv();
