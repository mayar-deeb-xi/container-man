import "server-only";

import { cookies } from "next/headers";

import type { PublicUser } from "@repo/auth";
import { ACCESS_TOKEN_COOKIE } from "@repo/auth";

import { env } from "~/env";

/**
 * Authoritative session check for server components.
 *
 * `proxy.ts` only inspects whether a cookie is present — it is a redirect for the
 * user's benefit, not an authorization boundary (the Next docs are explicit about
 * this). Anything that actually gates data asks the backend, which is the only
 * party that can tell a valid token from a forged one.
 */
export async function getServerSession(): Promise<PublicUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_TOKEN_COOKIE);

  if (!token) return null;

  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  try {
    const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });

    if (!response.ok) return null;
    return (await response.json()) as PublicUser;
  } catch {
    // Backend unreachable — treat as signed out rather than crashing the render.
    return null;
  }
}
