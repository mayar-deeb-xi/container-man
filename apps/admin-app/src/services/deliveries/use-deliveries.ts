"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { DeliveriesPage, DeliveriesQueryFilters, Delivery } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";

/** Root of the deliveries cache — every other deliveries key extends it. */
export const deliveriesKey = ["deliveries"] as const;

export const deliveriesListKey = (filters: DeliveriesQueryFilters) =>
  [...deliveriesKey, "list", filters] as const;

export async function listDeliveries(filters: DeliveriesQueryFilters): Promise<DeliveriesPage> {
  const { data } = await api.get<BaseResponse<Delivery[]>>("/deliveries", { params: filters });

  return {
    deliveries: data.data,
    pagination: data.pagination ?? { skip: filters.skip, take: filters.take, total: 0 },
  };
}

export function useDeliveries(
  filters: DeliveriesQueryFilters,
): UseQueryResult<DeliveriesPage, unknown> {
  return useQuery({
    queryKey: deliveriesListKey(filters),
    queryFn: () => listDeliveries(filters),
    placeholderData: keepPreviousData,
  });
}
