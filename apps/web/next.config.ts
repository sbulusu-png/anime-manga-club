import type { NextConfig } from "next";

/** Where the API runs. The browser never talks to it directly: /api/* is proxied. */
const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:4000";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The code is proprietary: never publish readable source maps to browsers.
  productionBrowserSourceMaps: false,
  // Links to pages that don't exist fail the type check.
  typedRoutes: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "s4.anilist.co", pathname: "/file/anilistcdn/**" },
    ],
  },
  // One origin for the whole site, so auth cookies are first-party (see PLAN.md 1.1).
  rewrites() {
    return Promise.resolve([{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }]);
  },
  headers() {
    return Promise.resolve([
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ]);
  },
};

export default config;
