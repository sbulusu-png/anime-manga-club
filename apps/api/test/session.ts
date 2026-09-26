import type { Hono } from "hono";

import type { AppEnv } from "../src/types.js";
import { WEB_ORIGIN, socketFrom, verifyEmail } from "./helpers.js";

let ipCounter = 0;
/** A fresh documentation-range IP per call, so auth rate limits never interfere. */
export const nextIp = () => {
  ipCounter++;
  return `198.18.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
};

/** Turns Set-Cookie headers into a Cookie header for the next request. */
export function cookiesFrom(res: Response, previous = ""): string {
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

/**
 * Signs up a member through the real auth API, confirms their email from the
 * verification link, and returns their session cookie.
 */
export async function createMember(
  app: Hono<AppEnv>,
  name: string,
  { username = name.toLowerCase() }: { username?: string | null } = {},
) {
  const res = await app.request(
    "/api/auth/sign-up/email",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN },
      body: JSON.stringify({
        name,
        email: `${name.toLowerCase()}@example.com`,
        password: "a-long-test-password",
        ...(username && { username }),
      }),
    },
    socketFrom(nextIp()),
  );
  if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  const { user } = (await res.json()) as { user: { id: string } };
  const email = `${name.toLowerCase()}@example.com`;
  const verified = await verifyEmail(app, email, nextIp());
  const cookie = cookiesFrom(verified);
  if (!cookie.includes("amc.session_token=")) {
    throw new Error(`email verification didn't sign in: ${verified.status}`);
  }
  return { id: user.id, cookie, email };
}

/** Sends a JSON request as a signed-in member (or anonymously with cookie ""). */
export function send(
  app: Hono<AppEnv>,
  method: string,
  path: string,
  { cookie = "", body }: { cookie?: string; body?: unknown } = {},
) {
  return app.request(
    path,
    {
      method,
      headers: {
        Origin: WEB_ORIGIN,
        ...(cookie && { Cookie: cookie }),
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    },
    socketFrom(nextIp()),
  );
}
