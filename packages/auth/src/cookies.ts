export const ACCESS_TOKEN_COOKIE = "cm_access_token";
export const REFRESH_TOKEN_COOKIE = "cm_refresh_token";

export type SameSite = "lax" | "strict" | "none";

export interface CookieConfig {
  /** Requires HTTPS. Must be true in production, and mandatory when sameSite is "none". */
  secure: boolean;
  sameSite: SameSite;
  /**
   * Shared parent domain (e.g. `.example.com`) so the admin app and the API can
   * both see the cookie. Leave undefined on localhost — browsers reject an
   * explicit `Domain=localhost` in some cases and the host-only default works.
   */
  domain?: string;
}

export interface CookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: SameSite;
  path: string;
  maxAge: number;
  domain?: string;
}

/**
 * Single source of truth for auth cookie attributes.
 *
 * Both tokens use `path: "/"` — scoping the refresh cookie to `/auth/refresh`
 * would be tighter, but the admin app's proxy needs to see the access cookie on
 * every route, and keeping the pair symmetrical avoids a class of bug where
 * logout clears one and not the other.
 */
export function buildCookieOptions(config: CookieConfig, maxAgeMs: number): CookieOptions {
  if (config.sameSite === "none" && !config.secure) {
    throw new Error('Cookie config invalid: sameSite="none" requires secure=true.');
  }

  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: config.sameSite,
    path: "/",
    maxAge: maxAgeMs,
    ...(config.domain ? { domain: config.domain } : {}),
  };
}

/** Matching attributes for clearing a cookie — must mirror how it was set. */
export function buildClearCookieOptions(config: CookieConfig): Omit<CookieOptions, "maxAge"> {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: config.sameSite,
    path: "/",
    ...(config.domain ? { domain: config.domain } : {}),
  };
}
