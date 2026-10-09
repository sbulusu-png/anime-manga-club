import { APIError, betterAuth } from "better-auth";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { and, eq } from "drizzle-orm";
import {
  admin,
  haveIBeenPwned,
  isPasswordCompromised,
  openAPI,
  username,
} from "better-auth/plugins";

import type { Db } from "./db/client.js";
import { accounts, sessions, users, verifications } from "./db/schema/index.js";
import { CLIENT_IP_HEADER } from "./lib/client-ip.js";
import {
  type Email,
  type Mailer,
  existingAccountEmail,
  passwordResetEmail,
  signInCodeEmail,
  verificationEmail,
} from "./lib/email.js";
import { emailNotAllowedMessage, isAllowedEmail } from "./lib/email-domains.js";
import { issueSignInCode } from "./services/sign-in-codes.js";
import { describeDevice } from "./lib/user-agent.js";

export interface AuthOptions {
  db: Db;
  /** Public origin users see, e.g. http://localhost:3000. OAuth callbacks go here. */
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
  google?: { clientId: string; clientSecret: string } | undefined;
  secureCookies: boolean;
  mailer: Mailer;
  /** Called when an email fails to send (sending never blocks the request). */
  onEmailError: (err: unknown, email: Email) => void;
  /** Email/password members must confirm their address before signing in. */
  requireEmailVerification: boolean;
  /** Reject passwords found in data breaches (Have I Been Pwned, k-anonymity). */
  checkBreachedPasswords: boolean;
  /** IANA time zone for times in emails, e.g. "Asia/Kolkata". */
  timeZone: string;
  /** Only emails at these domains (or their subdomains) can sign up or sign in. */
  allowedEmailDomains: readonly string[];
}

const BREACHED_PASSWORD_MESSAGE =
  "This password has appeared in a data breach. Please choose a different one.";

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/** How recently a Google-only member must have signed in to delete their account. */
const DELETE_FRESH_MS = 24 * 60 * 60 * 1000;

/**
 * Deleting an account can't be undone, but Better Auth only asks for a signed-in
 * session. Ask for more, so a stolen session can't wipe someone out: members with a
 * password must type it (Better Auth then checks it), and Google-only members must
 * have signed in within the last day.
 */
async function confirmAccountDeletion(ctx: HookContext) {
  const session = await getSessionFromCtx(ctx);
  if (!session) return; // Better Auth answers 401 itself.
  const accounts = await ctx.context.internalAdapter.findAccounts(session.user.id);
  const hasPassword = accounts.some((a) => a.providerId === "credential" && a.password);
  const body: unknown = ctx.body;
  const password = body && typeof body === "object" && "password" in body ? body.password : null;

  if (hasPassword) {
    if (typeof password !== "string" || password.length === 0) {
      throw APIError.from("BAD_REQUEST", {
        code: "PASSWORD_REQUIRED",
        message: "Enter your password to delete your account.",
      });
    }
    return;
  }
  if (Date.now() - new Date(session.session.createdAt).getTime() > DELETE_FRESH_MS) {
    throw APIError.from("FORBIDDEN", {
      code: "SESSION_NOT_FRESH",
      message: "For your safety, sign out and back in, then delete your account.",
    });
  }
}

/** Endpoints that take an email address, and the field it's in. */
const EMAIL_FIELDS: Record<string, string> = {
  "/sign-up/email": "email",
  "/sign-in/email": "email",
  "/request-password-reset": "email",
  "/send-verification-email": "email",
  "/change-email": "newEmail",
  "/admin/create-user": "email",
};

/**
 * What a session still waiting for its sign-in code may do: see who it belongs to, sign
 * out, or start over (sign in again, reset a password, confirm an email).
 */
const OPEN_BEFORE_CODE = [
  "/get-session",
  "/sign-out",
  "/sign-in",
  "/sign-up",
  "/callback",
  "/verify-email",
  "/send-verification-email",
  "/request-password-reset",
  "/reset-password",
  "/is-username-available",
  "/error",
  "/ok",
];
const openBeforeCode = (path: string) =>
  OPEN_BEFORE_CODE.some((open) => path === open || path.startsWith(`${open}/`));

/**
 * Sign-ins that don't need a code: opening the confirmation link already proved the
 * member owns the inbox, and a club lead "viewing as" someone already entered theirs.
 */
const provenByPath = (path: string | undefined) =>
  path === "/verify-email" || Boolean(path?.startsWith("/admin/impersonate"));

const bodyField = (body: unknown, field: string): unknown =>
  body && typeof body === "object" && field in body
    ? (body as Record<string, unknown>)[field]
    : null;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

export function createAuth(options: AuthOptions) {
  const { db } = options;
  const allowedEmail = (email: string) => isAllowedEmail(email, options.allowedEmailDomains);
  const emailNotAllowed = () =>
    APIError.from("BAD_REQUEST", {
      code: "EMAIL_NOT_ALLOWED",
      message: emailNotAllowedMessage(options.allowedEmailDomains),
    });

  // Fire-and-forget: waiting on the email provider would make responses slower when an
  // email is sent, which would leak whether an address is registered.
  const send = (email: Email) => {
    options.mailer.send(email).catch((err: unknown) => {
      options.onEmailError(err, email);
    });
    return Promise.resolve();
  };

  // "24 Sept 2026, 18:50 IST" (dateStyle can't be combined with a time zone name).
  const formatTime = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: options.timeZone,
    timeZoneName: "short",
  });

  /**
   * Emails a fresh code for this sign-in. `google` says how they signed in, for the
   * "not you?" advice; when unknown (a resend), it's Google only if they have no password.
   */
  async function sendSignInCode(
    session: SignInSession,
    { google, resend = false }: { google?: boolean; resend?: boolean } = {},
  ) {
    const [user] = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, session.userId));
    if (!user) return;
    const code = await issueSignInCode(db, session.id, { resend });
    const viaGoogle =
      google ??
      !(await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.userId, session.userId), eq(accounts.providerId, "credential")))
        .then((rows) => rows.length > 0));
    await send(
      signInCodeEmail(
        user.email,
        user.name,
        code,
        {
          when: formatTime.format(new Date(session.createdAt)),
          device: describeDevice(session.userAgent),
          ipAddress: session.ipAddress ?? null,
          method: viaGoogle ? "google" : "password",
        },
        `${options.baseURL}/forgot-password`,
      ),
    );
  }

  const auth = betterAuth({
    appName: "Anime Manga Club",
    baseURL: options.baseURL,
    basePath: "/api/auth",
    secret: options.secret,
    trustedOrigins: options.trustedOrigins,
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
      schema: { users, sessions, accounts, verifications },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
      autoSignIn: true,
      requireEmailVerification: options.requireEmailVerification,
      resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) => send(passwordResetEmail(user.email, user.name, url)),
      // Signing up with a taken email looks like success (so nobody can probe who's a
      // member); the real owner gets a heads-up instead.
      onExistingUserSignUp: ({ user }) =>
        send(existingAccountEmail(user.email, user.name, `${options.baseURL}/sign-in`)),
      // The fake "success" must look exactly like a real sign-up, plugin fields included.
      customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
        ...coreFields,
        username: null,
        displayUsername: null,
        role: "user",
        banned: false,
        banReason: null,
        banExpires: null,
        ...additionalFields,
        id,
      }),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true, // resend if an unverified member tries to sign in
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24, // 24 hours
      sendVerificationEmail: ({ user, url }) => send(verificationEmail(user.email, user.name, url)),
    },
    user: {
      // Members can delete their account; their reviews, likes and lists go with it.
      deleteUser: { enabled: true },
      // The university-only rule, whatever the route: email sign-up, an admin adding a
      // member, or Google (checked against the address Google sends on every sign-in).
      validateUserInfo: ({ user }) =>
        typeof user.email === "string" && allowedEmail(user.email)
          ? undefined
          : {
              error: "EMAIL_NOT_ALLOWED",
              errorDescription: emailNotAllowedMessage(options.allowedEmailDomains),
            },
    },
    socialProviders: options.google
      ? { google: { ...options.google, prompt: "select_account" } }
      : {},
    // Google sign-ins are only merged into an existing account whose email is
    // verified (Better Auth's default), which blocks account pre-hijacking.
    account: { accountLinking: { enabled: true } },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh the expiry at most once a day
      // No cookie cache: every request checks the session in the database, so signing out,
      // password resets, bans and account deletion take effect immediately.
      cookieCache: { enabled: false },
      additionalFields: {
        // Set once the member types the code emailed for this sign-in.
        signInCodeVerifiedAt: { type: "date", required: false, input: false },
      },
    },
    databaseHooks: {
      // No changing an address to one outside the university.
      user: {
        update: {
          before: (data) => {
            if (typeof data.email === "string" && !allowedEmail(data.email)) {
              throw emailNotAllowed();
            }
            return Promise.resolve();
          },
        },
      },
      session: {
        create: {
          // Accounts made before the rule (or by other means) can't sign in either.
          before: async (session, ctx) => {
            const [user] = await db
              .select({ email: users.email })
              .from(users)
              .where(eq(users.id, session.userId));
            if (!user || !allowedEmail(user.email)) throw emailNotAllowed();
            if (provenByPath(ctx?.path)) {
              return { data: { ...session, signInCodeVerifiedAt: new Date() } };
            }
          },
          // Every other sign-in waits for the code we email now.
          after: async (session, ctx) => {
            if ((session as { signInCodeVerifiedAt?: Date | null }).signInCodeVerifiedAt) return;
            await sendSignInCode(session, {
              google: Boolean(ctx?.path.startsWith("/callback/")),
            });
          },
        },
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      // Sign-in and sign-up keep Better Auth's stricter default of 3 per 10 seconds.
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const emailField = EMAIL_FIELDS[ctx.path];
        if (emailField) {
          const email = bodyField(ctx.body, emailField);
          if (typeof email === "string" && email.includes("@") && !allowedEmail(email)) {
            throw emailNotAllowed();
          }
        }
        // Until the sign-in code is entered, the session can't change anything.
        if (!openBeforeCode(ctx.path)) {
          const current = await getSessionFromCtx(ctx);
          if (current && !current.session.signInCodeVerifiedAt) {
            throw APIError.from("FORBIDDEN", {
              code: "SIGN_IN_CODE_REQUIRED",
              message: "Enter the code we emailed you to finish signing in.",
            });
          }
        }
        if (ctx.path === "/delete-user") {
          await confirmAccountDeletion(ctx);
          return;
        }
        // Better Auth uses up a reset link before hashing the new password, and the breach
        // check runs inside hashing, so a rejected password would burn the member's link.
        // Checking here first keeps the link usable for another try.
        if (!options.checkBreachedPasswords || ctx.path !== "/reset-password") return;
        const body: unknown = ctx.body;
        const password =
          body && typeof body === "object" && "newPassword" in body ? body.newPassword : null;
        if (
          typeof password !== "string" ||
          password.length < PASSWORD_MIN ||
          password.length > PASSWORD_MAX
        )
          return;
        if (await isPasswordCompromised(password)) {
          throw APIError.from("BAD_REQUEST", {
            code: "PASSWORD_COMPROMISED",
            message: BREACHED_PASSWORD_MESSAGE,
          });
        }
      }),
    },
    advanced: {
      // Better Auth turns origin checks off when NODE_ENV=test; keep them on
      // everywhere so tests exercise the same CSRF protection as production.
      disableOriginCheck: false,
      cookiePrefix: "amc",
      useSecureCookies: options.secureCookies,
      // The app resolves the client IP (see lib/client-ip.ts) and passes it in a
      // header clients can't set, so Better Auth never parses X-Forwarded-For itself.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    plugins: [
      username({ minUsernameLength: USERNAME_MIN, maxUsernameLength: USERNAME_MAX }),
      admin(),
      // Only the first 5 characters of the password's SHA-1 hash leave the server.
      haveIBeenPwned({
        enabled: options.checkBreachedPasswords,
        // The default list minus /reset-password, which the hook above checks earlier.
        paths: [
          "/sign-up/email",
          "/change-password",
          "/admin/create-user",
          "/admin/set-user-password",
        ],
        customPasswordCompromisedMessage: BREACHED_PASSWORD_MESSAGE,
      }),
      // Serves the auth endpoints' OpenAPI schema; our own docs page shows it.
      openAPI({ disableDefaultReference: true }),
    ],
  });
  return Object.assign(auth, { sendSignInCode });
}

interface SignInSession {
  id: string;
  userId: string;
  createdAt: Date;
  userAgent?: string | null | undefined;
  ipAddress?: string | null | undefined;
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
export type AuthUser = AuthSession["user"];
