import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Specs live beside the code they test; the shared DB harness stays in test/.
    alias: { "@test": path.resolve(__dirname, "test") },
  },
  test: {
    include: ["src/**/*.spec.ts"],
    setupFiles: ["./test/setup.ts"],
    globalSetup: ["./test/global-setup.ts"],
    // Every suite talks to the same test database and resets it between tests, so
    // suites must run one at a time — parallel files would truncate each other's data.
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
