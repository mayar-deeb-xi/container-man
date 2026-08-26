"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { TrashedContainer, TrashPage, TrashQueryFilters } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { containersKey } from "./use-containers";

/**
 * Under the containers root on purpose: a restore changes both the trash and the live
 * list, and one `invalidateQueries({ queryKey: containersKey })` must reach them all.
 */
export const trashedContainersKey = (filters: TrashQueryFilters) =>
  [...containersKey, "trash", filters] as const;

export async function listTrashedContainers(filters: TrashQueryFilters): Promise<TrashPage> {
  const { data } = await api.get<BaseResponse<TrashedContainer[]>>("/containers/trash", {
    params: filters,
  });

  return {
    containers: data.data,
    pagination: data.pagination ?? { skip: filters.skip, take: filters.take, total: 0 },
  };
}

export function useTrashedContainers(
  filters: TrashQueryFilters,
): UseQueryResult<TrashPage, unknown> {
  return useQuery({
    queryKey: trashedContainersKey(filters),
    queryFn: () => listTrashedContainers(filters),
    placeholderData: keepPreviousData,
  });
}
