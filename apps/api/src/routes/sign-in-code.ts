import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";

import type { Auth } from "../auth.js";
import type { Db } from "../db/client.js";
import { AppError } from "../lib/errors.js";
import { validate } from "../lib/validation.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { signInCodeStatus, verifySignInCode } from "../services/sign-in-codes.js";
import type { AppEnv } from "../types.js";

const verifyBody = z.strictObject({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from the email"),
});

/** "ch******@uni.edu": enough to recognise, not enough to harvest (at most 6 stars). */
function maskEmail(email: string) {
  const at = email.lastIndexOf("@");
  const name = email.slice(0, at);
  return `${name.slice(0, 2)}${"*".repeat(Math.min(Math.max(name.length - 2, 1), 6))}${email.slice(at)}`;
}

/**
 * The second step of every sign-in: the code we email when a session starts. Only a
 * session still waiting for its code can use these.
 */
export function signInCodeRoutes({
  db,
  auth,
  isTrustedProxy,
}: {
  db: Db;
  auth: Auth;
  isTrustedProxy: (ip: string) => boolean;
}) {
  const pending = (c: { get(key: "pendingSession"): AppEnv["Variables"]["pendingSession"] }) => {
    const session = c.get("pendingSession");
    if (!session) {
      throw new AppError(401, "NO_SIGN_IN_WAITING", "There's no sign-in waiting for a code.");
    }
    return session;
  };
  // Per sign-in and per visitor, so neither a stolen password nor many tabs can grind
  // through codes (each code also stops working after a few wrong tries).
  const guessLimit = rateLimit({
    name: "sign-in-code",
    windowMs: 60_000,
    max: 10,
    isTrustedProxy,
    keyBy: (c) => c.get("pendingSession")?.session.id,
  });

  return new Hono<AppEnv>()
    .get(
      "/",
      describeRoute({
        tags: ["Members"],
        summary: "Whether a sign-in is waiting for its code, and where the code went",
      }),
      async (c) => {
        const { session, user } = pending(c);
        return c.json({
          email: maskEmail(user.email),
          ...(await signInCodeStatus(db, session.id)),
        });
      },
    )
    .post(
      "/verify",
      describeRoute({ tags: ["Members"], summary: "Finish signing in with the emailed code" }),
      guessLimit,
      validate("json", verifyBody),
      async (c) => {
        const { session } = pending(c);
        await verifySignInCode(db, session.id, c.req.valid("json").code);
        return c.json({ ok: true });
      },
    )
    .post(
      "/resend",
      describeRoute({ tags: ["Members"], summary: "Email a new sign-in code" }),
      guessLimit,
      async (c) => {
        const { session } = pending(c);
        await auth.sendSignInCode(session, { resend: true });
        return c.json(await signInCodeStatus(db, session.id));
      },
    );
}
