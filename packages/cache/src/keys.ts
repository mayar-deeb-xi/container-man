import { env } from "./env";

/**
 * Every key goes through here so the prefix is applied in exactly one place; that is
 * what lets several environments share one Redis instance and what makes
 * prefix-scoped invalidation predictable.
 *
 * Named key builders for specific cached reads belong in this file too, next to
 * `cacheKey`, rather than as string literals at the call sites.
 */
export function cacheKey(...parts: (string | number)[]): string {
  return [env.REDIS_KEY_PREFIX, ...parts].join(":");
}

/** The `SCAN`/`KEYS` glob for a key group, e.g. `containers:*`. */
export function cacheKeyPattern(...parts: (string | number)[]): string {
  return `${cacheKey(...parts)}:*`;
}
