"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";

import type { RoleDetail } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { rolesKey } from "./use-roles";

/** Built from `rolesKey` rather than restating it, so the prefix stays one string. */
export const roleDetailKey = (id: string) => [...rolesKey, "detail", id] as const;

export async function getRole(id: string): Promise<RoleDetail> {
  const { data } = await api.get<BaseResponse<RoleDetail>>(`/roles/${id}`);
  return data.data;
}

export function useRole(id: string): UseQueryResult<RoleDetail, unknown> {
  return useQuery({
    queryKey: roleDetailKey(id),
    queryFn: () => getRole(id),
    enabled: Boolean(id),
  });
}
