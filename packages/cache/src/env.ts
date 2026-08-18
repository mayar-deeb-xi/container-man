import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

/**
 * Same walk-up as `@repo/db`: the repo keeps one `.env` at the workspace root, but
 * turbo runs each task with its cwd inside the package (and compiled output sits a
 * level deeper than the source), so neither a relative path nor `__dirname` is stable.
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
  /**
   * Absent means "no cache" rather than "misconfigured" — Redis is optional here, so
   * every call site has to work without it and nothing may throw at import time.
   */
  REDIS_URL: z
    .string()
    .refine((value) => value.startsWith("redis://") || value.startsWith("rediss://"), {
      error: "REDIS_URL must start with redis:// or rediss://",
    })
    .optional(),

  /**
   * Namespaces every key, which is what makes a shared Redis instance (and the
   * prefix-scoped invalidation in `delByPrefix`) safe across environments.
   */
  REDIS_KEY_PREFIX: z.string().min(1).default("container-man"),
});

// A blank value in a .env file is an unset value, not an invalid one.
const raw = {
  REDIS_URL: process.env.REDIS_URL || undefined,
  REDIS_KEY_PREFIX: process.env.REDIS_KEY_PREFIX || undefined,
};

const parsed = schema.safeParse(raw);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid cache environment:\n${issues}`);
}

export const env = parsed.data;
