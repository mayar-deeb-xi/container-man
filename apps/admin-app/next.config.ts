// Import order matters and is load-bearing: the first populates process.env from
// the workspace-root .env, the second validates it. Both are side-effect imports,
// which the import sorter leaves in place.
import "./load-root-env";
import "./src/env";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @repo/ui ships TypeScript source rather than a build artifact.
  transpilePackages: ["@repo/ui"],
};

export default nextConfig;
