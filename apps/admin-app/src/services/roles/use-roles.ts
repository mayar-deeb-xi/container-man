"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { Role, RolesPage, RolesQueryFilters } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";

/**
 * Root of the roles cache, and a prefix of every other roles key — which is what
 * lets a mutation invalidate the list, the filtered pages and the detail entries
 * in one call.
 */
export const rolesKey = ["roles"] as const;

export const rolesListKey = (filters: RolesQueryFilters) => [...rolesKey, "list", filters] as const;

export async function listRoles(filters: RolesQueryFilters): Promise<RolesPage> {
  const { data } = await api.get<BaseResponse<Role[]>>("/roles", { params: filters });

  return {
    roles: data.data,
    pagination: data.pagination ?? { skip: filters.skip, take: filters.take, total: 0 },
  };
}

/**
 * `enabled` exists for the callers that need the role *names* without necessarily being
 * allowed to read roles — the users table's filter, for one. Firing the request anyway
 * and discarding the 403 would put a red line in every such operator's console for a
 * dropdown they were never going to see.
 */
export function useRoles(
  filters: RolesQueryFilters,
  { enabled = true }: { enabled?: boolean } = {},
): UseQueryResult<RolesPage, unknown> {
  return useQuery({
    queryKey: rolesListKey(filters),
    queryFn: () => listRoles(filters),
    enabled,
    // Paging and typing in the search box both change the key; without this the table
    // would empty out and remount on every keystroke.
    placeholderData: keepPreviousData,
  });
}
