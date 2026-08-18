export type UserRole = "admin" | "user";

/** Claims carried by the short-lived access token. */
export interface AccessTokenPayload {
  /** User id. */
  sub: string;
  email: string;
  role: UserRole;
  /** Session id this token was issued under. */
  sid: string;
  iat: number;
  exp: number;
}

/**
 * Claims carried by the long-lived refresh token.
 *
 * `jti` is deliberately the `sessions.id` row: that is what makes rotation and
 * reuse-detection a single primary-key lookup rather than a table scan.
 */
export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
}

/** The user shape the backend returns to clients — never includes the hash. */
export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}
