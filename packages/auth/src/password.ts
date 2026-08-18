import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";

const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB — OWASP minimum for argon2id
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // A malformed stored hash must read as "wrong password", not a 500.
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same argon2 work a real login would, for the case where the email
 * doesn't exist. Without this a missing user returns noticeably faster than a
 * wrong password and leaks which accounts are registered.
 *
 * The hash is computed once from a random secret and memoized, so only the
 * first call pays for it. It must be a genuine argon2 digest — a hand-written
 * placeholder would fail to parse and return immediately, which is the exact
 * timing difference this exists to remove.
 */
export async function burnPasswordComparison(): Promise<false> {
  const pending = (dummyHash ??= argon2.hash(randomBytes(32).toString("hex"), ARGON2_OPTIONS));
  await argon2.verify(await pending, "not-the-password").catch(() => false);
  return false;
}

/**
 * Refresh tokens are stored as a SHA-256 digest rather than argon2: the token is
 * already 200+ bits of signed entropy, so it needs no stretching, and refresh
 * runs on every access-token expiry where argon2's cost would be felt.
 */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time comparison of two hex digests. A plain `===` short-circuits on the
 * first differing character, which leaks how much of a guessed digest was correct.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}
