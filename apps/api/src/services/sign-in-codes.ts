import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import type { Db } from "../db/client.js";
import { sessions, signInCodes } from "../db/schema/index.js";
import { AppError } from "../lib/errors.js";

/** How long a code works. */
export const CODE_TTL_MS = 10 * 60 * 1000;
/** Wrong guesses before a code stops working (a new one can be sent). */
export const MAX_ATTEMPTS = 5;
/** Codes per sign-in, counting the first. After that, sign in again. */
export const MAX_SENDS = 5;
/** Wait between sends, so the inbox isn't flooded. */
export const RESEND_AFTER_MS = 30 * 1000;

/**
 * Salted with the session, so a code is only good for the sign-in it was sent for.
 * Codes are short-lived and few guesses are allowed, so a fast hash is enough.
 */
export const hashCode = (sessionId: string, code: string) =>
  createHash("sha256").update(`${sessionId}:${code}`).digest("hex");

const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

type Executor = Pick<Db, "insert" | "select" | "update" | "delete">;

/**
 * Makes a fresh code for this sign-in (replacing any earlier one) and returns it for
 * emailing. The first code is free; resends wait RESEND_AFTER_MS and stop at MAX_SENDS.
 */
export async function issueSignInCode(
  db: Executor,
  sessionId: string,
  { resend = false, now = new Date() }: { resend?: boolean; now?: Date } = {},
): Promise<string> {
  const [existing] = await db
    .select()
    .from(signInCodes)
    .where(eq(signInCodes.sessionId, sessionId));
  if (resend && existing) {
    const waitMs = existing.sentAt.getTime() + RESEND_AFTER_MS - now.getTime();
    if (waitMs > 0) {
      throw new AppError(
        429,
        "CODE_RECENTLY_SENT",
        `We just sent a code. You can ask for another in ${String(Math.ceil(waitMs / 1000))} seconds.`,
      );
    }
    if (existing.sends >= MAX_SENDS) {
      throw new AppError(
        429,
        "TOO_MANY_CODES",
        "That's a lot of codes. Sign out and sign in again to get a new one.",
      );
    }
  }

  const code = newCode();
  const row = {
    codeHash: hashCode(sessionId, code),
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    attempts: 0,
    sentAt: now,
  };
  await db
    .insert(signInCodes)
    .values({ sessionId, ...row, sends: 1 })
    .onConflictDoUpdate({
      target: signInCodes.sessionId,
      set: { ...row, sends: sql`${signInCodes.sends} + 1` },
    });
  return code;
}

/** What the code page shows: when the code runs out and when another can be sent. */
export async function signInCodeStatus(db: Executor, sessionId: string, now = new Date()) {
  const [row] = await db.select().from(signInCodes).where(eq(signInCodes.sessionId, sessionId));
  if (!row) return { sent: false as const };
  return {
    sent: true as const,
    expiresAt: row.expiresAt.toISOString(),
    resendAvailableAt: new Date(row.sentAt.getTime() + RESEND_AFTER_MS).toISOString(),
    canResend: row.sends < MAX_SENDS,
    expired: row.expiresAt <= now,
  };
}

type Outcome = "ok" | "used-up" | "expired" | { wrong: number };

/**
 * Checks a typed code. Right: the session is marked verified and the code deleted.
 * Wrong: counts the attempt, and after MAX_ATTEMPTS the code stops working.
 */
export async function verifySignInCode(
  db: Db,
  sessionId: string,
  code: string,
  now = new Date(),
): Promise<void> {
  // Errors are thrown after the transaction: throwing inside would roll back the count.
  const outcome = await db.transaction(async (tx): Promise<Outcome> => {
    // Locked, so parallel guesses can't each slip under the attempt limit.
    const [row] = await tx
      .select()
      .from(signInCodes)
      .where(eq(signInCodes.sessionId, sessionId))
      .for("update");
    if (!row || row.attempts >= MAX_ATTEMPTS) return "used-up";
    if (row.expiresAt <= now) return "expired";

    const expected = Buffer.from(row.codeHash, "hex");
    const actual = Buffer.from(hashCode(sessionId, code), "hex");
    if (!timingSafeEqual(expected, actual)) {
      const attempts = row.attempts + 1;
      await tx.update(signInCodes).set({ attempts }).where(eq(signInCodes.sessionId, sessionId));
      return { wrong: MAX_ATTEMPTS - attempts };
    }

    await tx.update(sessions).set({ signInCodeVerifiedAt: now }).where(eq(sessions.id, sessionId));
    await tx.delete(signInCodes).where(eq(signInCodes.sessionId, sessionId));
    return "ok";
  });

  if (outcome === "ok") return;
  if (outcome === "used-up") {
    throw new AppError(400, "CODE_USED_UP", "This code no longer works. Ask for a new one below.");
  }
  if (outcome === "expired") {
    throw new AppError(400, "CODE_EXPIRED", "This code has expired. Ask for a new one below.");
  }
  const left = outcome.wrong;
  throw new AppError(
    400,
    "WRONG_CODE",
    left > 0
      ? `That code isn't right. ${String(left)} ${left === 1 ? "try" : "tries"} left.`
      : "That code isn't right, and it's now used up. Ask for a new one below.",
  );
}
