import type { Logger } from "./logger.js";

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(email: Email): Promise<void>;
}

/** Sends through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export function resendMailer({
  apiKey,
  from,
  fetch: fetchImpl = fetch,
}: {
  apiKey: string;
  from: string;
  fetch?: typeof fetch;
}): Mailer {
  return {
    async send(email) {
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, ...email }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new Error(`Resend rejected the email: ${res.status} ${await res.text()}`);
      }
    },
  };
}

/** Development: prints the email (with its link) to the log instead of sending it. */
export function logMailer(logger: Logger): Mailer {
  return {
    send(email) {
      logger.info({ to: email.to, subject: email.subject }, `email (not sent):\n${email.text}`);
      return Promise.resolve();
    },
  };
}

/** Tests: keeps every email in memory. */
export function memoryMailer() {
  const sent: Email[] = [];
  const mailer: Mailer & { sent: Email[] } = {
    sent,
    send(email) {
      sent.push(email);
      return Promise.resolve();
    },
  };
  return mailer;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);

function layout(greeting: string, lines: string[], action: { label: string; url: string }) {
  const text = [
    greeting,
    "",
    ...lines,
    "",
    `${action.label}: ${action.url}`,
    "",
    "— Anime Manga Club",
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1b1830">
<p>${escapeHtml(greeting)}</p>
${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n")}
<p><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:10px 18px;background:#e63946;color:#fff;border-radius:8px;text-decoration:none">${escapeHtml(action.label)}</a></p>
<p style="font-size:13px;color:#666">Or paste this link into your browser: ${escapeHtml(action.url)}</p>
<p>— Anime Manga Club</p>
</body></html>`;
  return { text, html };
}

export function verificationEmail(to: string, name: string, url: string): Email {
  return {
    to,
    subject: "Confirm your email for Anime Manga Club",
    ...layout(
      `Hi ${name},`,
      [
        "Welcome to the club! Confirm this is your email address to finish setting up your account.",
        "The link works for 24 hours. If you didn't sign up, you can ignore this email.",
      ],
      { label: "Confirm email", url },
    ),
  };
}

export function passwordResetEmail(to: string, name: string, url: string): Email {
  return {
    to,
    subject: "Reset your Anime Manga Club password",
    ...layout(
      `Hi ${name},`,
      [
        "Someone (hopefully you) asked to reset your password.",
        "The link works for 1 hour and signs you out everywhere once used. If you didn't ask, you can ignore this email; your password won't change.",
      ],
      { label: "Choose a new password", url },
    ),
  };
}

export function existingAccountEmail(to: string, name: string, signInUrl: string): Email {
  return {
    to,
    subject: "Someone tried to sign up with your email",
    ...layout(
      `Hi ${name},`,
      [
        "Someone just tried to create an Anime Manga Club account with this email address, but you already have one.",
        "If it was you, sign in instead, or reset your password if you've forgotten it. If it wasn't you, you can ignore this email.",
      ],
      { label: "Sign in", url: signInUrl },
    ),
  };
}

export interface SignInDetails {
  when: string;
  device: string;
  ipAddress: string | null;
  method: "password" | "google";
}

/**
 * "New sign-in to your account", with what to do if it wasn't them. For password
 * sign-ins that's a password reset (which also signs out every device); for Google
 * sign-ins it's the Google account that needs securing.
 */
export function signInAlertEmail(
  to: string,
  name: string,
  details: SignInDetails,
  resetUrl: string,
): Email {
  const google = details.method === "google";
  return {
    to,
    subject: "New sign-in to your Anime Manga Club account",
    ...layout(
      `Hi ${name},`,
      [
        "Your Anime Manga Club account was just signed in to.",
        `When: ${details.when}`,
        `Device: ${details.device}`,
        ...(details.ipAddress ? [`IP address: ${details.ipAddress}`] : []),
        `Signed in with: ${google ? "Google" : "your password"}`,
        "If this was you, there's nothing to do.",
        google
          ? "If it wasn't, someone may be able to use your Google account. Change your Google password and check which devices are signed in to it."
          : "If it wasn't, change your password now. Resetting it signs you out on every device, including theirs.",
      ],
      google
        ? { label: "Secure my Google account", url: "https://myaccount.google.com/security" }
        : { label: "Change my password", url: resetUrl },
    ),
  };
}
