import { type NextRequest, NextResponse } from "next/server";

import { VISITOR_IP_HEADER, WEB_PROXY_SECRET_HEADER, visitorHeaders } from "@/lib/visitor";

/**
 * Runs before /api requests are forwarded to the API (the rewrite in next.config.ts):
 * adds the visitor's IP and the shared secret, and drops any copies a visitor sent.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete(WEB_PROXY_SECRET_HEADER);
  headers.delete(VISITOR_IP_HEADER);
  for (const [name, value] of Object.entries(visitorHeaders(request.headers))) {
    headers.set(name, value);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: "/api/:path*" };
