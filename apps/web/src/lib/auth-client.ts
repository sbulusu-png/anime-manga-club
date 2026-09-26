import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/client";

/**
 * Talks to Better Auth through this site's own /api proxy, so the session cookie stays
 * first-party. No baseURL: the client uses the current origin.
 */
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [usernameClient()],
});

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Mirrors Better Auth's username rule, so members see problems before submitting. */
export function usernameProblem(username: string): string | null {
  if (username.length < USERNAME_MIN) return `Use at least ${String(USERNAME_MIN)} characters.`;
  if (username.length > USERNAME_MAX) return `Use at most ${String(USERNAME_MAX)} characters.`;
  if (!/^[a-zA-Z0-9_.]+$/.test(username)) return "Use only letters, numbers, dots and underscores.";
  return null;
}

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match. Please try again.",
  INVALID_USERNAME_OR_PASSWORD: "That username and password don't match. Please try again.",
  EMAIL_NOT_VERIFIED:
    "Please confirm your email first. We've just sent you a fresh link, so check your inbox.",
  USERNAME_IS_ALREADY_TAKEN: "That username is taken. Try another one.",
  INVALID_USERNAME: "Use only letters, numbers, dots and underscores.",
  PASSWORD_TOO_SHORT: `Your password needs at least ${String(PASSWORD_MIN)} characters.`,
  PASSWORD_TOO_LONG: `Your password can be at most ${String(PASSWORD_MAX)} characters.`,
  PASSWORD_COMPROMISED:
    "This password has appeared in a data breach. Please choose a different one.",
  INVALID_PASSWORD: "That password isn't right. Please try again.",
  PASSWORD_REQUIRED: "Enter your password to confirm.",
  SESSION_NOT_FRESH: "For your safety, sign out and back in, then try again.",
  INVALID_TOKEN: "This link has expired or was already used. Please ask for a new one.",
  BANNED_USER: "This account has been suspended. Contact a club lead if you think it's a mistake.",
};

/** A message a member can act on, for an error from the auth client. */
export function authErrorMessage(error: {
  code?: string | undefined;
  message?: string | undefined;
  status: number;
}): string {
  if (error.status === 429) return "Too many attempts. Please wait a minute and try again.";
  if (error.code && error.code in MESSAGES) return MESSAGES[error.code] ?? "";
  if (error.status >= 500 || error.status === 0) {
    return "Something went wrong on our side. Please try again in a moment.";
  }
  return error.message ?? "Something went wrong. Please try again.";
}
