// Tables owned by Better Auth (core + username + admin plugins). Field names must
// match what Better Auth expects; test/auth-schema.test.ts guards against drift.
import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable("users", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  // username plugin
  username: text().unique(),
  displayUsername: text(),
  // admin plugin
  role: text().notNull().default("user"),
  banned: boolean().notNull().default(false),
  banReason: text(),
  banExpires: timestamp({ withTimezone: true }),
  ...timestamps,
});

export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(),
    token: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // admin plugin
    impersonatedBy: text(),
    // When the member typed the code we emailed for this sign-in (see sign_in_codes).
    // Until then the session can't do anything but enter the code or sign out.
    signInCodeVerifiedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

/**
 * The 6-digit code emailed for each new sign-in (ours, not Better Auth's). Only a hash
 * is kept, and the row goes once the code is used or the session ends.
 */
export const signInCodes = pgTable("sign_in_codes", {
  sessionId: text()
    .primaryKey()
    .references(() => sessions.id, { onDelete: "cascade" }),
  codeHash: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  /** Wrong guesses at this code; it stops working after a few. */
  attempts: integer().notNull().default(0),
  /** Codes sent for this session so far (the first one, plus any resends). */
  sends: integer().notNull().default(1),
  sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.identifier)],
);
