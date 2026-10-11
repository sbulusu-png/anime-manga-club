/**
 * Every request reaches the API from this website's servers, so on its own the API would
 * see one IP for everybody and rate-limit the whole club as a single visitor. The website
 * therefore passes on each visitor's IP, with a secret the API shares, so the API knows it
 * came from us (apps/api/src/lib/client-ip.ts). Must match the API's header names.
 */
export const WEB_PROXY_SECRET_HEADER = "x-amc-proxy-secret";
export const VISITOR_IP_HEADER = "x-amc-visitor-ip";

/**
 * The visitor's IP as the hosting platform saw it. Vercel sets both headers itself and
 * overwrites anything a visitor sends, so they can be trusted there.
 */
function visitorIp(incoming: Headers): string | null {
  const real = incoming.get("x-real-ip")?.trim();
  if (real) return real;
  const first = incoming.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first === undefined || first === "" ? null : first;
}

/**
 * Headers telling the API who the visitor is. Empty without the shared secret (local
 * development), where the API sees visitors directly anyway.
 */
export function visitorHeaders(incoming: Headers): Record<string, string> {
  const secret = process.env.WEB_PROXY_SECRET;
  const ip = visitorIp(incoming);
  if (!secret || !ip) return {};
  return { [WEB_PROXY_SECRET_HEADER]: secret, [VISITOR_IP_HEADER]: ip };
}
