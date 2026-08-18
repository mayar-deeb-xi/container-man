"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { PublicUser } from "@repo/auth";

import type { BaseResponse } from "~/lib/base-response";
import { api, isUnauthorized } from "~/lib/axios";
import { queryKeys } from "~/lib/query-keys";

export interface LoginPayload {
  email: string;
  password: string;
}

// --- Raw API calls ---------------------------------------------------------
// Exported separately from the hooks so non-React callers (server components,
// scripts) can reuse them without pulling in React Query.

export async function login(payload: LoginPayload): Promise<PublicUser> {
  const { data } = await api.post<BaseResponse<PublicUser>>("/auth/login", payload);
  return data.data;
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout");
}

export async function getMe(): Promise<PublicUser> {
  const { data } = await api.get<BaseResponse<PublicUser>>("/auth/me");
  return data.data;
}

// --- Hooks -----------------------------------------------------------------

export function useSession(): UseQueryResult<PublicUser, unknown> {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: getMe,
    // A 401 here means "not logged in", which is an answer, not a failure — the
    // axios interceptor has already attempted a refresh by this point.
    retry: (failureCount, error) => !isUnauthorized(error) && failureCount < 2,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: login,
    onSuccess: (user) => {
      // Seed the cache so the dashboard renders without a second round trip.
      queryClient.setQueryData(queryKeys.session, user);
    },
    onSettled: () => {
      // refresh() re-runs the server components so the proxy sees the new cookie.
      router.refresh();
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    },
  });
}
