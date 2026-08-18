import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

/**
 * The repo keeps a single `.env` at the workspace root, but turbo runs each task
 * with its cwd inside the package (and the compiled output sits one level deeper
 * than the source), so neither a relative path nor `__dirname` is stable. Walk up
 * until we find it instead.
 */
function findRootEnvFile(): string | undefined {
  let dir = process.cwd();
  const { root } = parse(dir);

  for (;;) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    if (dir === root) return undefined;
    dir = dirname(dir);
  }
}

loadDotenv({ path: findRootEnvFile(), quiet: true });

const schema = z.object({
  DATABASE_URL: z.url({ error: "DATABASE_URL must be a valid postgres connection URL" }),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(
    `Invalid database environment:\n${issues}\n\nDid you copy .env.example to .env at the repo root?`,
  );
}

export const env = parsed.data;
