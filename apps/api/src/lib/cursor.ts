import { z } from "zod";

import { AppError } from "./errors.js";

/**
 * Opaque keyset-pagination cursor: the last row's sort value plus its id, so the
 * next page starts exactly after it even when rows are added in between.
 */
const cursorSchema = z.tuple([
  z.union([z.number(), z.string().max(100)]),
  z.union([z.number().int(), z.uuid()]),
]);
export type Cursor = z.infer<typeof cursorSchema>;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(value: string): Cursor {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    throw new AppError(400, "INVALID_CURSOR", "That page link is invalid or expired.");
  }
}
