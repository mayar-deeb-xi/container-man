"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";

import type { User } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { usersKey } from "./use-users";

/** Built from `usersKey` rather than restating it, so the prefix stays one string. */
export const userDetailKey = (id: string) => [...usersKey, "detail", id] as const;

export async function getUser(id: string): Promise<User> {
  const { data } = await api.get<BaseResponse<User>>(`/users/${id}`);
  return data.data;
}

export function useUser(id: string): UseQueryResult<User, unknown> {
  return useQuery({
    queryKey: userDetailKey(id),
    queryFn: () => getUser(id),
    enabled: Boolean(id),
  });
}
