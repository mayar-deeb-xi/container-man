/**
 * Central key factory. Services import from here so an invalidation in one place
 * can never miss a cache entry because of a hand-typed key.
 */
export const queryKeys = {
  session: ["session"] as const,
} as const;
