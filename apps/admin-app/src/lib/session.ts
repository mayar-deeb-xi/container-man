import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { ACCESS_TOKEN_COOKIE } from "@repo/auth";

import type { BaseResponse } from "~/lib/base-response";
import type { SessionUser } from "~/services/auth/types";
import { env } from "~/env";

/**
 * Authoritative session check for server components.
 *
 * `proxy.ts` only inspects whether a cookie is present — it is a redirect for the
 * user's benefit, not an authorization boundary (the Next docs are explicit about
 * this). Anything that actually gates data asks the backend, which is the only
 * party that can tell a valid token from a forged one.
 *
 * Wrapped in `cache()` so the layout gate and the page that needs the user share
 * one `/auth/me` round trip per request instead of issuing one each. The cache is
 * scoped to a single render pass, so it can never leak across users or requests.
 */
export const getServerSession = cache(async (): Promise<SessionUser | null> => {
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
    const body = (await response.json()) as BaseResponse<SessionUser>;
    return body.data;
  } catch {
    // Backend unreachable — treat as signed out rather than crashing the render.
    return null;
  }
});
