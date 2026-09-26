/** Calls the API from the browser (through the /api proxy, with the session cookie). */

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; status: number; code: string; message: string };

/**
 * Sends a request and turns every failure (the API's error body, a rate limit, a
 * network error) into one shape with a message a member can act on.
 */
export async function apiSend<T = unknown>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: `/api/${string}`,
  body?: unknown,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      ...(body !== undefined && {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      code: "NETWORK",
      message: "You seem to be offline. Check your connection and try again.",
    };
  }

  if (res.ok) {
    const data = (res.status === 204 ? null : await res.json()) as T;
    return { ok: true, data };
  }
  if (res.status === 429) {
    return {
      ok: false,
      status: 429,
      code: "RATE_LIMITED",
      message: "You're going a bit fast. Wait a minute and try again.",
    };
  }
  const parsed = (await res.json().catch(() => null)) as {
    error?: { code?: string; message?: string };
  } | null;
  return {
    ok: false,
    status: res.status,
    code: parsed?.error?.code ?? "UNKNOWN",
    message:
      res.status >= 500 || !parsed?.error?.message
        ? "Something went wrong on our side. Please try again in a moment."
        : parsed.error.message,
  };
}
