// Import order matters and is load-bearing: the first populates process.env from
// the workspace-root .env, the second validates it. Both are side-effect imports,
// which the import sorter leaves in place.
import "./load-root-env";
import "./src/env";

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // These packages ship TypeScript source rather than a build artifact.
  transpilePackages: ["@repo/ui", "@repo/white-label"],
};

// Registers src/i18n/request.ts, which is what lets server components call
// getLocale()/getTranslations() without the locale being passed down as a prop.
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
