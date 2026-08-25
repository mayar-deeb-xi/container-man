"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";

import type { EffectiveRule } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { usersKey } from "./use-users";

export const userRulesKey = (id: string) => [...usersKey, "rules", id] as const;

/**
 * The rules a user's roles add up to, resolved by the backend exactly as its guards
 * resolve them — placeholders substituted.
 *
 * Asking the API rather than unioning the roles' rules in the browser is the point: the
 * answer the console shows has to be the answer the API will act on, and a second
 * implementation of the union is a second chance to be wrong.
 */
export async function getUserRules(id: string): Promise<EffectiveRule[]> {
  const { data } = await api.get<BaseResponse<EffectiveRule[]>>(`/users/${id}/rules`);
  return data.data;
}

export function useUserRules(id: string): UseQueryResult<EffectiveRule[], unknown> {
  return useQuery({
    queryKey: userRulesKey(id),
    queryFn: () => getUserRules(id),
    enabled: Boolean(id),
  });
}
