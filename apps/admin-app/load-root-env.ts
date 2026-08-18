import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { config as loadDotenv } from "dotenv";

/**
 * Next only auto-loads a `.env` sitting beside the app, but this repo keeps a
 * single one at the workspace root (shared with the backend and drizzle-kit).
 *
 * This lives in its own module rather than inline in next.config.ts because
 * static imports are hoisted: as a separate side-effect import it is guaranteed
 * to finish evaluating before `./src/env` reads process.env.
 */
let dir = process.cwd();
const { root } = parse(dir);

for (;;) {
  const candidate = join(dir, ".env");
  if (existsSync(candidate)) {
    loadDotenv({ path: candidate, quiet: true });
    break;
  }
  if (dir === root) break;
  dir = dirname(dir);
}
