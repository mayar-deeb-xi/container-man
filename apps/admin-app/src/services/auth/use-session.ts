"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";

import type { PublicUser } from "@repo/auth";

import type { BaseResponse } from "~/lib/base-response";
import { api, isUnauthorized } from "~/lib/axios";

/**
 * Cache key for the signed-in user. Exported because a hook that ends a session
 * has to drop this entry, and a hand-typed copy of the key there would miss it
 * silently — the query would simply never refetch.
 */
export const sessionKey = ["session"] as const;

/**
 * The one source of the signed-in user — login and refresh only set cookies.
 *
 * Exported alongside the hook, as every call in this folder is, so non-React
 * callers (server components, scripts) can reuse it without pulling in React
 * Query.
 */
export async function getMe(): Promise<PublicUser> {
  const { data } = await api.get<BaseResponse<PublicUser>>("/auth/me");
  return data.data;
}

export function useSession(): UseQueryResult<PublicUser, unknown> {
  return useQuery({
    queryKey: sessionKey,
    queryFn: getMe,
    // A 401 here means "not logged in", which is an answer, not a failure — the
    // axios interceptor has already attempted a refresh by this point.
    retry: (failureCount, error) => !isUnauthorized(error) && failureCount < 2,
    staleTime: 60_000,
  });
}
