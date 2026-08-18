// Import order matters and is load-bearing: the first populates process.env from
// the workspace-root .env, the second validates it. load-root-env is a pure
// side-effect import, which the import sorter leaves in place.
import "./load-root-env";

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { env } from "./src/env";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // These packages ship TypeScript source rather than a build artifact.
  transpilePackages: ["@repo/ui", "@repo/white-label"],
  // All browser→backend traffic flows through this same-origin path, so the
  // backend's httpOnly auth cookies are first-party to this app. That is what
  // lets proxy.ts see them — the two deployments share no parent domain (and
  // *.vercel.app is on the Public Suffix List, so they never could).
  // The path must match the axios baseURL (src/lib/axios.ts) and the matcher
  // exclusion in src/proxy.ts.
  rewrites() {
    return [{ source: "/api/backend/:path*", destination: `${env.API_URL}/:path*` }];
  },
};

// Registers src/i18n/request.ts, which is what lets server components call
// getLocale()/getTranslations() without the locale being passed down as a prop.
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
