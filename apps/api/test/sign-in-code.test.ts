import { eq, sql } from "drizzle-orm";
import type { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";

import { sessions, signInCodes } from "../src/db/schema/index.js";
import { isAllowedEmail } from "../src/lib/email-domains.js";
import type { ErrorBody } from "../src/lib/errors.js";
import type { AppEnv } from "../src/types.js";
import {
  UNIVERSITY_DOMAINS,
  WEB_ORIGIN,
  codeFromEmail,
  enterSignInCode,
  mailbox,
  makeApp,
  makeAuth,
  socketFrom,
} from "./helpers.js";
import { cookiesFrom, createMember, nextIp, send } from "./session.js";
import { type TestDb, createTestDb } from "./test-db.js";

const PASSWORD = "a-long-test-password";

let db: TestDb;
let app: Hono<AppEnv>;
/** The same API, with production's rule: university emails only. */
let universityOnly: Hono<AppEnv>;

beforeAll(async () => {
  ({ db } = await createTestDb());
  ({ app } = makeApp(db));
  ({ app: universityOnly } = makeApp(db, {
    auth: makeAuth(db, { allowedEmailDomains: UNIVERSITY_DOMAINS }),
  }));
});

const post = (target: Hono<AppEnv>, path: string, body: unknown, cookie = "") =>
  target.request(
    path,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: WEB_ORIGIN,
        ...(cookie && { Cookie: cookie }),
      },
      body: JSON.stringify(body),
    },
    socketFrom(nextIp()),
  );

/** Signs in with a password; the session then waits for its emailed code. */
async function signIn(email: string, target = app) {
  const res = await post(target, "/api/auth/sign-in/email", { email, password: PASSWORD });
  expect(res.status).toBe(200);
  return cookiesFrom(res);
}

/** The code of an error from our own routes. */
const errorCode = async (res: Response) => ((await res.json()) as ErrorBody).error.code;

describe("university emails only", () => {
  it("knows the university's addresses from lookalikes", () => {
    const allowed = (email: string) => isAllowedEmail(email, UNIVERSITY_DOMAINS);
    expect(allowed("ravi@university.example")).toBe(true);
    expect(allowed("Ravi@COLLEGE.EXAMPLE")).toBe(true);
    expect(allowed("ravi@students.college.example")).toBe(true);
    expect(allowed("ravi@gmail.com")).toBe(false);
    expect(allowed("ravi@notuniversity.example")).toBe(false);
    expect(allowed("ravi@university.example.evil.com")).toBe(false);
    expect(allowed("university.example")).toBe(false);
  });

  it("refuses to sign up anyone else, with a clear message", async () => {
    const res = await post(universityOnly, "/api/auth/sign-up/email", {
      name: "Outsider",
      email: "outsider@gmail.com",
      password: PASSWORD,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("EMAIL_NOT_ALLOWED");
    expect(body.message).toContain("university.example or college.example");
    expect(mailbox.sent.some((e) => e.to === "outsider@gmail.com")).toBe(false);

    const ok = await post(universityOnly, "/api/auth/sign-up/email", {
      name: "Student",
      email: "student@university.example",
      password: PASSWORD,
    });
    expect(ok.status).toBe(200);
  });

  it("turns away Google accounts outside the university, even ones that change address", () => {
    const auth = makeAuth(db, { allowedEmailDomains: UNIVERSITY_DOMAINS });
    const validate = auth.options.user.validateUserInfo;
    const google = { method: "oauth", oauth: { providerId: "google" } } as const;
    const check = (email: string, action: "create-user" | "sign-in") =>
      validate({ user: { email }, source: { ...google, action } });

    expect(check("someone@gmail.com", "create-user")).toMatchObject({
      error: "EMAIL_NOT_ALLOWED",
    });
    expect(check("someone@gmail.com", "sign-in")).toMatchObject({ error: "EMAIL_NOT_ALLOWED" });
    expect(check("student@college.example", "create-user")).toBeUndefined();
  });

  it("locks out older accounts with other addresses", async () => {
    // Made while example.com was allowed; production doesn't allow it.
    const old = await createMember(app, "OldTimer");
    const res = await post(universityOnly, "/api/auth/sign-in/email", {
      email: old.email,
      password: PASSWORD,
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("EMAIL_NOT_ALLOWED");

    const byUsername = await post(universityOnly, "/api/auth/sign-in/username", {
      username: "oldtimer",
      password: PASSWORD,
    });
    expect(byUsername.status).toBe(400);
  });
});

describe("sessions from before the rule", () => {
  it("are signed out, whether or not their code was entered", async () => {
    // Signed in (and past the code) while example.com was allowed; production doesn't allow it.
    const { cookie } = await createMember(app, "Grandfathered");
    expect((await send(app, "GET", "/api/me", { cookie })).status).toBe(200);

    const rename = await post(
      universityOnly,
      "/api/auth/update-user",
      { name: "Still here" },
      cookie,
    );
    expect(rename.status).toBe(400);
    expect(((await rename.json()) as { code: string }).code).toBe("EMAIL_NOT_ALLOWED");
    // The session is gone for good, even where the address is allowed.
    expect((await send(app, "GET", "/api/me", { cookie })).status).toBe(401);
  });

  it("can't ask for or enter a sign-in code", async () => {
    const { email } = await createMember(app, "HalfwayThere");
    const cookie = await signIn(email);

    const code = await send(universityOnly, "GET", "/api/sign-in-code", { cookie });
    expect(code.status).toBe(401);
    const me = await send(universityOnly, "GET", "/api/me", { cookie });
    expect(await errorCode(me)).toBe("UNAUTHENTICATED");
    expect((await enterSignInCode(app, cookie, email)).status).toBe(401);
  });
});

describe("the sign-in code", () => {
  it("is needed after every sign-in, including after signing out", async () => {
    const { email } = await createMember(app, "Rin");
    const cookie = await signIn(email);

    expect((await send(app, "GET", "/api/me", { cookie })).status).toBe(401);
    const status = await send(app, "GET", "/api/sign-in-code", { cookie });
    expect(await status.json()).toMatchObject({ email: "ri*@example.com", sent: true });

    expect((await enterSignInCode(app, cookie, email)).status).toBe(200);
    expect((await send(app, "GET", "/api/me", { cookie })).status).toBe(200);

    await post(app, "/api/auth/sign-out", {}, cookie);
    const again = await signIn(email);
    expect((await send(app, "GET", "/api/me", { cookie: again })).status).toBe(401);
    expect((await enterSignInCode(app, again, email)).status).toBe(200);
    expect((await send(app, "GET", "/api/me", { cookie: again })).status).toBe(200);
  });

  it("isn't needed right after confirming an email (the link proved the inbox)", async () => {
    const { cookie } = await createMember(app, "Fresh");
    expect((await send(app, "GET", "/api/me", { cookie })).status).toBe(200);
  });

  it("leaves a waiting session unable to do anything else", async () => {
    const { email } = await createMember(app, "Waiting");
    const cookie = await signIn(email);

    const list = await send(app, "PUT", "/api/list/1", { cookie, body: { status: "completed" } });
    expect(list.status).toBe(401);
    expect(await errorCode(list)).toBe("SIGN_IN_CODE_REQUIRED");

    const rename = await post(app, "/api/auth/update-user", { name: "Hacked" }, cookie);
    expect(rename.status).toBe(403);
    expect(((await rename.json()) as { code: string }).code).toBe("SIGN_IN_CODE_REQUIRED");

    const remove = await post(app, "/api/auth/delete-user", { password: PASSWORD }, cookie);
    expect(remove.status).toBe(403);

    // It can still sign out.
    expect((await post(app, "/api/auth/sign-out", {}, cookie)).status).toBe(200);
  });

  it("stops working after 5 wrong tries, and a new one can be sent", async () => {
    const { email } = await createMember(app, "Guesser");
    const cookie = await signIn(email);
    const right = codeFromEmail(email);
    const wrong = right === "000000" ? "111111" : "000000";

    for (let left = 4; left >= 0; left--) {
      const res = await post(app, "/api/sign-in-code/verify", { code: wrong }, cookie);
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe("WRONG_CODE");
    }
    const tooLate = await post(app, "/api/sign-in-code/verify", { code: right }, cookie);
    expect(await errorCode(tooLate)).toBe("CODE_USED_UP");

    // Another code can't be sent straight away...
    const soon = await post(app, "/api/sign-in-code/resend", {}, cookie);
    expect(soon.status).toBe(429);
    expect(await errorCode(soon)).toBe("CODE_RECENTLY_SENT");
    // ...but can 30 seconds later, and the new one works.
    await db.update(signInCodes).set({ sentAt: sql`now() - interval '31 seconds'` });
    expect((await post(app, "/api/sign-in-code/resend", {}, cookie)).status).toBe(200);
    expect(codeFromEmail(email)).not.toBe(right);
    expect((await enterSignInCode(app, cookie, email)).status).toBe(200);
  });

  it("expires after 10 minutes", async () => {
    const { email } = await createMember(app, "Slowpoke");
    const cookie = await signIn(email);
    await db.update(signInCodes).set({ expiresAt: sql`now() - interval '1 second'` });

    const res = await enterSignInCode(app, cookie, email);
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe("CODE_EXPIRED");
  });

  it("only works for the sign-in it was sent for", async () => {
    const { email } = await createMember(app, "TwoTabs");
    const first = await signIn(email);
    const firstCode = codeFromEmail(email);
    const second = await signIn(email);

    const res = await post(app, "/api/sign-in-code/verify", { code: firstCode }, second);
    expect(res.status).toBe(400);
    expect((await post(app, "/api/sign-in-code/verify", { code: firstCode }, first)).status).toBe(
      200,
    );
    // The second tab is still waiting.
    const [waiting] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, (await db.select().from(signInCodes))[0]?.sessionId ?? ""));
    expect(waiting?.signInCodeVerifiedAt).toBeNull();
  });

  it("can't be used without a sign-in waiting for it", async () => {
    const guest = await post(app, "/api/sign-in-code/verify", { code: "123456" });
    expect(guest.status).toBe(401);
    const { cookie } = await createMember(app, "AlreadyIn");
    const member = await post(app, "/api/sign-in-code/verify", { code: "123456" }, cookie);
    expect(member.status).toBe(401);
  });
});
