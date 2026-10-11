import type { RequestIdVariables } from "hono/request-id";

import type { AuthSession, AuthUser } from "./auth.js";
import type { Logger } from "./lib/logger.js";

/** Hono context typing shared by the whole app. */
export interface AppEnv {
  Variables: RequestIdVariables & {
    log: Logger;
    user: AuthUser | null;
    session: AuthSession["session"] | null;
    /** The visitor's IP as the website vouched for it (see lib/client-ip.ts), if it did. */
    visitorIp: string | undefined;
    /** A session still waiting for its emailed sign-in code (user and session are null). */
    pendingSession: AuthSession | null;
  };
}
