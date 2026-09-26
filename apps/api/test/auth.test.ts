import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";

import { accounts, sessions, users } from "../src/db/schema/index.js";
import type { ErrorBody } from "../src/lib/errors.js";
import { requireRole, requireUsername } from "../src/middleware/auth.js";
import type { AppEnv } from "../src/types.js";
import {
  GOOGLE_CLIENT_ID,
  WEB_ORIGIN,
  linkFromEmail,
  mailbox,
  makeApp,
  socketFrom,
  verifyEmail,
} from "./helpers.js";
import { type TestDb, createTestDb } from "./test-db.js";

let db: TestDb;
let app: Hono<AppEnv>;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const made = makeApp(db);
  app = made.app;
  // Test-only routes that exercise the guards.
  app.get("/api/test/admin", requireRole("admin"), (c) => c.json({ ok: true }));
  app.post("/api/test/needs-username", requireUsername, (c) => c.json({ ok: true }));
});

// Better Auth's rate-limit store is shared across the file, so every simulated
// client gets its own IP unless a test is deliberately reusing one.
let nextIp = 1;
const freshIp = () => `203.0.113.${nextIp++}`;

function post(path: string, body: unknown, { cookie = "", ip = freshIp() } = {}) {
  return app.request(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN, Cookie: cookie },
      body: JSON.stringify(body),
    },
    socketFrom(ip),
  );
}

/** Turns Set-Cookie headers into a Cookie header for the next request. */
function cookiesFrom(res: Response, previous = ""): string {
  const jar = new Map(
    previous
      .split("; ")
      .filter(Boolean)
      .map((pair) => pair.split("=", 2) as [string, string]),
  );
  for (const header of res.headers.getSetCookie()) {
    const [pair = ""] = header.split(";");
    const [name = "", value = ""] = pair.split("=", 2);
    jar.set(name, value);
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

let userCount = 0;
/** Signs up, then (unless verify is false) confirms the email the way a member would. */
async function signUp(fields: { username?: string; password?: string; verify?: boolean } = {}) {
  userCount++;
  const email = `member${userCount}@example.com`;
  const password = fields.password ?? "correct-horse-battery";
  const res = await post("/api/auth/sign-up/email", {
    name: `Member ${userCount}`,
    email,
    password,
    ...(fields.username && { username: fields.username }),
  });
  if (res.status !== 200 || fields.verify === false) {
    return { res, email, password, verified: undefined, cookie: "" };
  }
  const verified = await verifyEmail(app, email, freshIp());
  return { res, email, password, verified, cookie: cookiesFrom(verified) };
}

function me(cookie: string) {
  return app.request("/api/me", { headers: { Cookie: cookie } });
}

describe("email sign-up and sign-in", () => {
  it("signs members in only once they confirm their email, with an httpOnly cookie", async () => {
    const { res, verified, cookie, email } = await signUp({ username: "Straw_Hat" });

    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().some((h) => h.startsWith("amc.session_token="))).toBe(false);
    expect(linkFromEmail(email, /Confirm your email/).pathname).toBe("/api/auth/verify-email");

    expect(verified?.status).toBe(302);
    const sessionCookie = verified?.headers
      .getSetCookie()
      .find((header) => header.startsWith("amc.session_token="));
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);

    const body = (await (await me(cookie)).json()) as {
      user: Record<string, unknown>;
      needsUsername: boolean;
    };
    expect(body.user).toMatchObject({
      username: "straw_hat", // stored lowercase
      displayUsername: "Straw_Hat",
      role: "user",
    });
    expect(body.needsUsername).toBe(false);
  });

  it("won't sign in an unconfirmed member, and resends the confirmation email", async () => {
    const { email, password } = await signUp({ username: "unconfirmed", verify: false });
    const before = mailbox.sent.filter((e) => e.to === email).length;

    const res = await post("/api/auth/sign-in/email", { email, password });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(mailbox.sent.filter((e) => e.to === email)).toHaveLength(before + 1);
  });

  it("never returns the password hash", async () => {
    const { res, cookie } = await signUp({ username: "hashcheck" });

    expect(JSON.stringify(await res.json())).not.toMatch(/password/i);
    expect(JSON.stringify(await (await me(cookie)).json())).not.toMatch(/password/i);
  });

  it("signs in with the right password only", async () => {
    const { email, password } = await signUp({ username: "signin_test" });

    const wrong = await post("/api/auth/sign-in/email", { email, password: "wrong-password" });
    expect(wrong.status).toBe(401);

    const right = await post("/api/auth/sign-in/email", { email, password });
    expect(right.status).toBe(200);
    expect((await me(cookiesFrom(right))).status).toBe(200);
  });

  it("rejects passwords shorter than 8 characters", async () => {
    const { res } = await signUp({ username: "shortpw", password: "short" });

    expect(res.status).toBe(400);
  });

  it("doesn't reveal that an email is already registered", async () => {
    const { res: real, email } = await signUp({ username: "first_one", verify: false });
    const realBody = (await real.json()) as { user: Record<string, unknown> };

    const again = await post("/api/auth/sign-up/email", {
      name: "Copycat",
      email,
      password: "another-long-password",
    });

    // Same status, same fields, no session: indistinguishable from a real sign-up.
    expect(again.status).toBe(200);
    const fakeBody = (await again.json()) as { user: Record<string, unknown> };
    expect(Object.keys(fakeBody.user).sort()).toEqual(Object.keys(realBody.user).sort());
    expect(again.headers.getSetCookie().some((h) => h.startsWith("amc.session_token="))).toBe(
      false,
    );
    // The real owner is told someone tried.
    expect(mailbox.sent.at(-1)).toMatchObject({
      to: email,
      subject: "Someone tried to sign up with your email",
    });
    const [row] = await db.select().from(users).where(eq(users.email, email));
    expect(row?.name).toBe(`Member ${userCount}`); // the original account is untouched
  });

  it("signs out", async () => {
    const { cookie } = await signUp({ username: "leaving" });

    const res = await post("/api/auth/sign-out", {}, { cookie });
    expect(res.status).toBe(200);
    expect((await me(cookiesFrom(res, cookie))).status).toBe(401);
  });
});

describe("password reset", () => {
  const requestReset = (email: string) =>
    post("/api/auth/request-password-reset", { email, redirectTo: `${WEB_ORIGIN}/reset-password` });

  it("resets the password from the emailed link and signs out every device", async () => {
    const { email, password, cookie } = await signUp({ username: "forgetful" });

    expect((await requestReset(email)).status).toBe(200);
    const link = linkFromEmail(email, /Reset your/);

    // The emailed link checks the token, then sends the member to the website's reset page.
    const opened = await app.request(`${link.pathname}${link.search}`);
    expect(opened.status).toBe(302);
    const resetPage = new URL(opened.headers.get("location") ?? "");
    expect(resetPage.origin + resetPage.pathname).toBe(`${WEB_ORIGIN}/reset-password`);
    const token = resetPage.searchParams.get("token") ?? "";

    const reset = await post("/api/auth/reset-password", {
      token,
      newPassword: "a-brand-new-password",
    });
    expect(reset.status).toBe(200);

    expect((await me(cookie)).status).toBe(401); // old session revoked
    expect((await post("/api/auth/sign-in/email", { email, password })).status).toBe(401);
    const fresh = await post("/api/auth/sign-in/email", {
      email,
      password: "a-brand-new-password",
    });
    expect(fresh.status).toBe(200);

    // Each reset link works once.
    const reused = await post("/api/auth/reset-password", {
      token,
      newPassword: "another-one-123",
    });
    expect(reused.status).toBe(400);
  });

  it("answers the same for unknown emails, without sending anything", async () => {
    const before = mailbox.sent.length;

    const res = await requestReset("nobody-here@example.com");

    expect(res.status).toBe(200);
    expect(mailbox.sent).toHaveLength(before);
  });

  it("only redirects to our own site", async () => {
    const { email } = await signUp({ username: "redirected" });

    const res = await post("/api/auth/request-password-reset", {
      email,
      redirectTo: "https://evil.example/steal",
    });
    expect(res.status).toBe(403);
  });
});

describe("deleting an account", () => {
  it("deletes the member after confirming their password", async () => {
    const { cookie, email, password } = await signUp({ username: "goodbye" });

    const wrong = await post("/api/auth/delete-user", { password: "wrong-password" }, { cookie });
    expect(wrong.status).toBe(400);
    const res = await post("/api/auth/delete-user", { password }, { cookie });

    expect(res.status).toBe(200);
    expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(0);
    expect((await me(cookie)).status).toBe(401);
  });

  it("won't delete a password account without the password, even when signed in", async () => {
    const { cookie, email } = await signUp({ username: "stolen_cookie" });

    const res = await post("/api/auth/delete-user", {}, { cookie });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "PASSWORD_REQUIRED" });
    expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(1);
  });

  it("needs a recent sign-in to delete a Google-only account", async () => {
    const { cookie, email } = await signUp({ username: "google_only" });
    const [user] = await db.select().from(users).where(eq(users.email, email));
    const userId = user?.id ?? "";
    // Turn it into a Google-only account: no password on file.
    await db.delete(accounts).where(eq(accounts.userId, userId));
    await db
      .update(sessions)
      .set({ createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) })
      .where(eq(sessions.userId, userId));

    const stale = await post("/api/auth/delete-user", {}, { cookie });
    expect(stale.status).toBe(403);
    expect(await stale.json()).toMatchObject({ code: "SESSION_NOT_FRESH" });

    await db.update(sessions).set({ createdAt: new Date() }).where(eq(sessions.userId, userId));
    expect((await post("/api/auth/delete-user", {}, { cookie })).status).toBe(200);
    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(0);
  });
});

describe("usernames", () => {
  it("rejects a username that is taken, ignoring case", async () => {
    await signUp({ username: "zoro" });

    const { res } = await signUp({ username: "ZORO" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "USERNAME_IS_ALREADY_TAKEN" });
  });

  it.each([
    ["too short", "ab", "USERNAME_TOO_SHORT"],
    ["too long", "a".repeat(21), "USERNAME_TOO_LONG"],
    ["invalid characters", "no spaces!", "INVALID_USERNAME"],
  ])("rejects usernames that are %s", async (_reason, username, code) => {
    const { res } = await signUp({ username });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code });
  });

  it("lets a user without a username pick one (Google-style onboarding)", async () => {
    const { cookie } = await signUp();

    let body = (await (await me(cookie)).json()) as { needsUsername: boolean };
    expect(body.needsUsername).toBe(true);
    expect((await post("/api/test/needs-username", {}, { cookie })).status).toBe(403);

    const update = await post("/api/auth/update-user", { username: "nami" }, { cookie });
    expect(update.status).toBe(200);
    const updatedCookie = cookiesFrom(update, cookie);

    body = (await (await me(updatedCookie)).json()) as { needsUsername: boolean };
    expect(body.needsUsername).toBe(false);
    expect((await post("/api/test/needs-username", {}, { cookie: updatedCookie })).status).toBe(
      200,
    );
  });

  it("reports whether a username is available", async () => {
    await signUp({ username: "sanji" });

    const taken = await post("/api/auth/is-username-available", { username: "Sanji" });
    const free = await post("/api/auth/is-username-available", { username: "usopp" });
    expect(await taken.json()).toMatchObject({ available: false });
    expect(await free.json()).toMatchObject({ available: true });
  });
});

describe("guards", () => {
  it("answers 401 with the standard error shape when signed out", async () => {
    const res = await app.request("/api/me");

    expect(res.status).toBe(401);
    expect(((await res.json()) as ErrorBody).error.code).toBe("UNAUTHENTICATED");
  });

  it("lets only admins through requireRole, and notices role changes immediately", async () => {
    const { cookie, email } = await signUp({ username: "club_lead" });
    const admin = () => app.request("/api/test/admin", { headers: { Cookie: cookie } });

    expect((await admin()).status).toBe(403);

    await db.update(users).set({ role: "admin" }).where(eq(users.email, email));
    expect((await admin()).status).toBe(200);

    await db.update(users).set({ role: "user" }).where(eq(users.email, email));
    expect((await admin()).status).toBe(403);
  });

  it("blocks cross-site requests that carry a user's session (CSRF)", async () => {
    const { cookie } = await signUp({ username: "csrf_target" });
    const update = (headers: Record<string, string>) =>
      app.request(
        "/api/auth/update-user",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie, ...headers },
          body: JSON.stringify({ name: "Hacked" }),
        },
        socketFrom(freshIp()),
      );

    expect((await update({ Origin: "https://evil.example" })).status).toBe(403);
    expect((await update({})).status).toBe(403); // no Origin at all
    expect((await update({ Origin: WEB_ORIGIN })).status).toBe(200);
  });

  it("rejects callback URLs pointing at other sites (open redirect)", async () => {
    const res = await post("/api/auth/sign-in/social", {
      provider: "google",
      callbackURL: "https://evil.example/steal",
    });

    expect(res.status).toBe(403);
  });
});

describe("rate limiting", () => {
  const attempt = (ip: string, headers: Record<string, string> = {}) =>
    app.request(
      "/api/auth/sign-in/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN, ...headers },
        body: JSON.stringify({ email: "nobody@example.com", password: "wrong-password" }),
      },
      socketFrom(ip),
    );

  it("allows 3 sign-in attempts per 10 seconds from one address", async () => {
    const ip = freshIp();
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await attempt(ip)).status);

    expect(statuses).toEqual([401, 401, 401, 429]);
    expect((await attempt(freshIp())).status).toBe(401); // other people are unaffected
  });

  it("cannot be dodged by faking X-Forwarded-For", async () => {
    const ip = freshIp();
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await attempt(ip, { "X-Forwarded-For": `198.51.100.${i}` })).status);
    }

    expect(statuses.at(-1)).toBe(429);
  });

  it("ignores a client-supplied x-amc-client-ip header", async () => {
    const ip = freshIp();
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await attempt(ip, { "x-amc-client-ip": `198.51.100.${i}` })).status);
    }

    expect(statuses.at(-1)).toBe(429);
  });

  it("uses the forwarded client address when the request comes through our proxy", async () => {
    const proxy = "10.0.0.5"; // e.g. the website server or the host's load balancer
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await attempt(proxy, { "X-Forwarded-For": "192.0.2.77" })).status);
    }
    expect(statuses).toEqual([401, 401, 401, 429]);

    // A different visitor behind the same proxy has their own allowance.
    expect((await attempt(proxy, { "X-Forwarded-For": "192.0.2.78" })).status).toBe(401);
  });
});

describe("client IP", () => {
  it("records a local visitor's address on the session", async () => {
    const res = await app.request(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN },
        body: JSON.stringify({
          name: "Local",
          email: "local@example.com",
          password: "local-password-123",
          username: "local_user",
        }),
      },
      socketFrom("198.51.100.1"),
    );
    expect(res.status).toBe(200);
    // The session starts when the member opens the confirmation link, here from localhost.
    expect((await verifyEmail(app, "local@example.com", "127.0.0.1")).status).toBe(302);

    const [session] = await db
      .select({ ip: sessions.ipAddress })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(users.email, "local@example.com"));
    // (IPv6 addresses are stored per /64 block, Better Auth's rate-limit granularity.)
    expect(session?.ip).toBe("127.0.0.1");
  });
});

describe("dev-only routes", () => {
  it("are not mounted outside development", async () => {
    expect((await app.request("/api/dev/google")).status).toBe(404);
  });
});

describe("Google sign-in", () => {
  it("redirects to Google with our client id and callback URL", async () => {
    const res = await post("/api/auth/sign-in/social", { provider: "google", callbackURL: "/" });

    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    const google = new URL(url);
    expect(google.hostname).toBe("accounts.google.com");
    expect(google.searchParams.get("client_id")).toBe(GOOGLE_CLIENT_ID);
    expect(google.searchParams.get("redirect_uri")).toBe(`${WEB_ORIGIN}/api/auth/callback/google`);
    expect(google.searchParams.get("prompt")).toBe("select_account");
    expect(google.searchParams.get("state")).toBeTruthy();
  });
});

describe("sign-in alerts", () => {
  const CHROME_ON_WINDOWS =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
  const alertsTo = (email: string) =>
    mailbox.sent.filter((e) => e.to === email && e.subject.startsWith("New sign-in"));

  function signIn(path: string, body: unknown, ip: string) {
    return app.request(
      path,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: WEB_ORIGIN,
          "User-Agent": CHROME_ON_WINDOWS,
        },
        body: JSON.stringify(body),
      },
      socketFrom(ip),
    );
  }

  it("emails the member when they sign in, with a way to lock out an intruder", async () => {
    const { email, password } = await signUp({ username: "alerted" });
    // Confirming the email signs the member in too, but that's not a "new sign-in".
    expect(alertsTo(email)).toHaveLength(0);

    const res = await signIn("/api/auth/sign-in/email", { email, password }, "198.51.100.77");
    expect(res.status).toBe(200);

    const [alert] = alertsTo(email);
    expect(alert?.text).toContain("Device: Chrome on Windows");
    expect(alert?.text).toContain("IP address: 198.51.100.77");
    expect(alert?.text).toMatch(/When: .+ (IST|GMT\+5:30)/);
    expect(alert?.text).toContain(`Change my password: ${WEB_ORIGIN}/forgot-password`);
  });

  it("also emails on username sign-in", async () => {
    const { email, password } = await signUp({ username: "alerted_by_name" });

    await signIn(
      "/api/auth/sign-in/username",
      { username: "alerted_by_name", password },
      freshIp(),
    );

    expect(alertsTo(email)).toHaveLength(1);
  });

  it("sends nothing for a wrong password", async () => {
    const { email } = await signUp({ username: "not_alerted" });

    const res = await signIn(
      "/api/auth/sign-in/email",
      { email, password: "not-the-password" },
      freshIp(),
    );

    expect(res.status).toBe(401);
    expect(alertsTo(email)).toHaveLength(0);
  });
});
