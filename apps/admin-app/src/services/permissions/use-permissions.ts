"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";

import type { Permission } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";

export const permissionsKey = ["permissions"] as const;

export async function listPermissions(): Promise<Permission[]> {
  const { data } = await api.get<BaseResponse<Permission[]>>("/permissions");
  return data.data;
}

export function usePermissions(): UseQueryResult<Permission[], unknown> {
  return useQuery({
    queryKey: permissionsKey,
    queryFn: listPermissions,
    // The catalog only changes when the backend is redeployed with a new subject, so
    // refetching it while an operator fills in a matrix would be pure noise.
    staleTime: 10 * 60_000,
  });
}
