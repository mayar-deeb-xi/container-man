/**
 * Claims carried by the short-lived access token.
 *
 * Deliberately carries no authorization: there is no `role` claim, and no packed
 * rule set. A token is valid for fifteen minutes, so anything about *what the
 * bearer may do* would be fifteen minutes stale — a user whose roles were just
 * revoked would keep acting on the old ones. Identity is what a token can prove;
 * abilities are resolved from the database on every request that needs them.
 */
export interface AccessTokenPayload {
  /** User id. */
  sub: string;
  email: string;
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
