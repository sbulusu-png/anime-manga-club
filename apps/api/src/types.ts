import type { RequestIdVariables } from "hono/request-id";

import type { AuthSession, AuthUser } from "./auth.js";
import type { Logger } from "./lib/logger.js";

/** Hono context typing shared by the whole app. */
export interface AppEnv {
  Variables: RequestIdVariables & {
    log: Logger;
    user: AuthUser | null;
    session: AuthSession["session"] | null;
  };
}
