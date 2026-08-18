const UNIT_MS = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

type Unit = keyof typeof UNIT_MS;

/**
 * Parses a duration string like `15m`, `2h`, or `7d` into milliseconds.
 *
 * The same string feeds both the JWT `exp` claim and the cookie `maxAge`, so
 * parsing it in one place is what keeps the token and its cookie from expiring
 * at different times.
 */
export function parseDuration(value: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value.trim());
  if (!match) {
    throw new Error(
      `Invalid duration "${value}". Expected a number followed by s, m, h, or d (e.g. "15m").`,
    );
  }
  const amount = Number(match[1]);
  const unit = match[2] as Unit;
  return amount * UNIT_MS[unit];
}

/** Default access token lifetime: 15 minutes. */
export const DEFAULT_ACCESS_TOKEN_TTL = "15m";

/** Default refresh token lifetime: 7 days. */
export const DEFAULT_REFRESH_TOKEN_TTL = "7d";

/**
 * How long a just-rotated refresh token still counts as a benign race rather than
 * theft.
 *
 * Rotation is not atomic across a browser: two tabs, a prefetch alongside a
 * navigation, or a retried request can all present the same token within a few
 * hundred milliseconds. Without this window those legitimate races would trip
 * reuse-detection and sign the user out for doing nothing wrong.
 */
export const REFRESH_REUSE_GRACE_MS = 30_000;
