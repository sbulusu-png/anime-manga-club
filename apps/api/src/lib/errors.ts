import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Shape of every error body the API returns. */
export interface ErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

/**
 * An expected failure with a status code and a machine-readable code, e.g.
 * `throw new AppError(404, "ANIME_NOT_FOUND", "No anime with that id")`.
 */
export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;

  constructor(status: ContentfulStatusCode, code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}
