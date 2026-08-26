"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type {
  TrashedDeliveriesPage,
  TrashedDeliveriesQueryFilters,
  TrashedDelivery,
} from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { deliveriesKey } from "./use-deliveries";

/** Under the deliveries root, so one invalidation reaches the trash and the register. */
export const trashedDeliveriesKey = (filters: TrashedDeliveriesQueryFilters) =>
  [...deliveriesKey, "trash", filters] as const;

export async function listTrashedDeliveries(
  filters: TrashedDeliveriesQueryFilters,
): Promise<TrashedDeliveriesPage> {
  const { data } = await api.get<BaseResponse<TrashedDelivery[]>>("/deliveries/trash", {
    params: filters,
  });

  return {
    deliveries: data.data,
    pagination: data.pagination ?? { skip: filters.skip, take: filters.take, total: 0 },
  };
}

export function useTrashedDeliveries(
  filters: TrashedDeliveriesQueryFilters,
): UseQueryResult<TrashedDeliveriesPage, unknown> {
  return useQuery({
    queryKey: trashedDeliveriesKey(filters),
    queryFn: () => listTrashedDeliveries(filters),
    placeholderData: keepPreviousData,
  });
}
