"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { Container, ContainersPage, ContainersQueryFilters } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";

/**
 * Root of the containers cache, and a prefix of every other containers key — which is what
 * lets a mutation invalidate the list, the filtered pages and the detail entries in one
 * call.
 */
export const containersKey = ["containers"] as const;

export const containersListKey = (filters: ContainersQueryFilters) =>
  [...containersKey, "list", filters] as const;

export async function listContainers(filters: ContainersQueryFilters): Promise<ContainersPage> {
  const { data } = await api.get<BaseResponse<Container[]>>("/containers", {
    // axios drops `undefined` params, so an unset filter never reaches the query string —
    // which matters because the backend rejects an empty `status`.
    params: filters,
  });

  return {
    containers: data.data,
    pagination: data.pagination ?? { skip: filters.skip, take: filters.take, total: 0 },
  };
}

export function useContainers(
  filters: ContainersQueryFilters,
): UseQueryResult<ContainersPage, unknown> {
  return useQuery({
    queryKey: containersListKey(filters),
    queryFn: () => listContainers(filters),
    // Paging and typing in the search box both change the key. Without this the table would
    // empty out and remount on every keystroke.
    placeholderData: keepPreviousData,
  });
}
