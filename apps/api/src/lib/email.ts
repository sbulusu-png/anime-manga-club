import { TEST_EMAIL_DOMAIN, isAllowedEmail } from "./email-domains.js";
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

/** "Anime Manga Club <club@mail.example.com>" (or just the address) as name and email. */
export function parseSender(from: string): { name?: string; email: string } | null {
  const named = /^\s*(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(from);
  if (named) {
    const [, name = "", email = ""] = named;
    return name ? { name: name.replace(/^"|"$/g, ""), email } : { email };
  }
  const bare = from.trim();
  return /^[^<>\s]+@[^<>\s]+$/.test(bare) ? { email: bare } : null;
}

/** Sends through Brevo's HTTP API (https://developers.brevo.com/reference/send-transac-email). */
export function brevoMailer({
  apiKey,
  from,
  fetch: fetchImpl = fetch,
}: {
  apiKey: string;
  /** A sender verified in Brevo, e.g. "Anime Manga Club <club@mail.example.com>". */
  from: string;
  fetch?: typeof fetch;
}): Mailer {
  const sender = parseSender(from);
  if (!sender) throw new Error(`EMAIL_FROM isn't an email address: ${from}`);
  return {
    async send(email) {
      const res = await fetchImpl("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sender,
          to: [{ email: email.to }],
          subject: email.subject,
          htmlContent: email.html,
          textContent: email.text,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new Error(`Brevo rejected the email: ${res.status} ${await res.text()}`);
      }
    },
  };
}

/**
 * Picks where each email goes. Test accounts' addresses (example.com) are only ever
 * printed: sending to them would bounce and hurt the sending domain's reputation. With
 * `alsoLog` (development), real emails are printed as well, so codes can be read there.
 */
export function routedMailer({
  deliver,
  log,
  alsoLog,
}: {
  deliver: Mailer | null;
  log: Mailer;
  alsoLog: boolean;
}): Mailer {
  return {
    async send(email) {
      if (!deliver || isAllowedEmail(email.to, [TEST_EMAIL_DOMAIN])) {
        await log.send(email);
        return;
      }
      if (alsoLog) await log.send(email);
      await deliver.send(email);
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

function layout(
  greeting: string,
  lines: string[],
  action: { label: string; url: string } | null,
  /** Shown big near the top, such as a sign-in code. */
  highlight?: string,
) {
  const text = [
    greeting,
    "",
    ...(highlight ? [highlight, ""] : []),
    ...lines,
    "",
    ...(action ? [`${action.label}: ${action.url}`, ""] : []),
    "— Anime Manga Club",
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1b1830">
<p>${escapeHtml(greeting)}</p>
${highlight ? `<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0">${escapeHtml(highlight)}</p>` : ""}
${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n")}
${
  action
    ? `<p><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:10px 18px;background:#e63946;color:#fff;border-radius:8px;text-decoration:none">${escapeHtml(action.label)}</a></p>
<p style="font-size:13px;color:#666">Or paste this link into your browser: ${escapeHtml(action.url)}</p>`
    : ""
}
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
 * The code for finishing a sign-in, with where the sign-in came from. If it wasn't them,
 * the stranger can't get in without this code, but their password (or Google account)
 * is known, so the email says what to secure.
 */
export function signInCodeEmail(
  to: string,
  name: string,
  code: string,
  details: SignInDetails,
  resetUrl: string,
): Email {
  const google = details.method === "google";
  return {
    to,
    subject: `${code} is your Anime Manga Club sign-in code`,
    ...layout(
      `Hi ${name},`,
      [
        "Enter this code to finish signing in. It works for 10 minutes. Never share it: the club will never ask you for it.",
        `When: ${details.when}`,
        `Device: ${details.device}`,
        ...(details.ipAddress ? [`IP address: ${details.ipAddress}`] : []),
        `Signed in with: ${google ? "Google" : "your password"}`,
        google
          ? "Not you? Don't enter the code. Someone may be able to use your Google account: change your Google password and check which devices are signed in to it."
          : "Not you? Don't enter the code, and change your password now: someone knows it.",
      ],
      google
        ? { label: "Secure my Google account", url: "https://myaccount.google.com/security" }
        : { label: "Change my password", url: resetUrl },
      code,
    ),
  };
}
