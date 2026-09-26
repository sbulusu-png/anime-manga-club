import { pino } from "pino";

import { env } from "../env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  // Readable, coloured logs locally; one JSON object per line everywhere else.
  ...(env.NODE_ENV === "development" && {
    transport: { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss" } },
  }),
  redact: ["req.headers.cookie", "req.headers.authorization"],
});

export type Logger = typeof logger;
