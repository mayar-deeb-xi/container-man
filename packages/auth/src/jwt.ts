import { errors, jwtVerify, SignJWT } from "jose";

import type { AccessTokenPayload, RefreshTokenPayload } from "./types";

const ALGORITHM = "HS256";

function toKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * Verification never throws. Callers need to treat "expired" differently from
 * "forged" — the admin app's proxy lets an expired token through so the client
 * can refresh, but redirects on anything malformed.
 */
export type VerifyResult<T> =
  | { status: "valid"; payload: T }
  | { status: "expired" }
  | { status: "invalid" };

export interface AccessTokenInput {
  userId: string;
  email: string;
  sessionId: string;
}

export async function signAccessToken(
  input: AccessTokenInput,
  secret: string,
  ttl: string,
): Promise<string> {
  return new SignJWT({ email: input.email, sid: input.sessionId })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(input.userId)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(toKey(secret));
}

export interface RefreshTokenInput {
  userId: string;
  /** Session row id — becomes the `jti` claim. */
  sessionId: string;
}

export async function signRefreshToken(
  input: RefreshTokenInput,
  secret: string,
  ttl: string,
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(input.userId)
    .setJti(input.sessionId)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(toKey(secret));
}

async function verify<T>(token: string, secret: string): Promise<VerifyResult<T>> {
  try {
    const { payload } = await jwtVerify(token, toKey(secret), {
      algorithms: [ALGORITHM],
    });
    return { status: "valid", payload: payload as T };
  } catch (error) {
    if (error instanceof errors.JWTExpired) {
      return { status: "expired" };
    }
    return { status: "invalid" };
  }
}

export function verifyAccessToken(
  token: string,
  secret: string,
): Promise<VerifyResult<AccessTokenPayload>> {
  return verify<AccessTokenPayload>(token, secret);
}

export function verifyRefreshToken(
  token: string,
  secret: string,
): Promise<VerifyResult<RefreshTokenPayload>> {
  return verify<RefreshTokenPayload>(token, secret);
}
