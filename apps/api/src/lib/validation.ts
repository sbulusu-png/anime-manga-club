import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { ValidationTargets } from "hono";
import { validator } from "hono-openapi";

import { AppError } from "./errors.js";

/** Formats issues like Zod's prettifyError: "✖ message\n  → at path". */
function formatIssues(issues: readonly StandardSchemaV1.Issue[]): string {
  return issues
    .map((issue) => {
      const path = (issue.path ?? [])
        .map((segment) => String(typeof segment === "object" ? segment.key : segment))
        .join(".");
      return path ? `✖ ${issue.message}\n  → at ${path}` : `✖ ${issue.message}`;
    })
    .join("\n");
}

/**
 * Validates part of the request against a schema (which also documents it in the
 * OpenAPI spec) and fails with our standard error body.
 */
export function validate<Target extends keyof ValidationTargets, Schema extends StandardSchemaV1>(
  target: Target,
  schema: Schema,
) {
  return validator(target, schema, (result) => {
    if (!result.success) {
      throw new AppError(400, "VALIDATION_ERROR", formatIssues(result.error));
    }
  });
}
