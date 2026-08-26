"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { SuppliersQueryFilters, TrashedSupplier, TrashedSuppliersPage } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { suppliersKey } from "./use-suppliers";

/** Under the suppliers root, so one invalidation reaches the trash and the live list. */
export const trashedSuppliersKey = (filters: SuppliersQueryFilters) =>
  [...suppliersKey, "trash", filters] as const;

export async function listTrashedSuppliers(
  filters: SuppliersQueryFilters,
): Promise<TrashedSuppliersPage> {
  const { data } = await api.get<BaseResponse<TrashedSupplier[]>>("/suppliers/trash", {
    params: filters,
  });

  return {
    suppliers: data.data,
    pagination: data.pagination ?? { skip: filters.skip, take: filters.take, total: 0 },
  };
}

export function useTrashedSuppliers(
  filters: SuppliersQueryFilters,
): UseQueryResult<TrashedSuppliersPage, unknown> {
  return useQuery({
    queryKey: trashedSuppliersKey(filters),
    queryFn: () => listTrashedSuppliers(filters),
    placeholderData: keepPreviousData,
  });
}
