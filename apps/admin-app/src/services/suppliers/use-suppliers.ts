"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { Supplier, SuppliersPage, SuppliersQueryFilters } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";

/** Root of the suppliers cache — the prefix every mutation invalidates. */
export const suppliersKey = ["suppliers"] as const;

export const suppliersListKey = (filters: SuppliersQueryFilters) =>
  [...suppliersKey, "list", filters] as const;

export async function listSuppliers(filters: SuppliersQueryFilters): Promise<SuppliersPage> {
  const { data } = await api.get<BaseResponse<Supplier[]>>("/suppliers", { params: filters });

  return {
    suppliers: data.data,
    pagination: data.pagination ?? { skip: filters.skip, take: filters.take, total: 0 },
  };
}

export function useSuppliers(
  filters: SuppliersQueryFilters,
): UseQueryResult<SuppliersPage, unknown> {
  return useQuery({
    queryKey: suppliersListKey(filters),
    queryFn: () => listSuppliers(filters),
    placeholderData: keepPreviousData,
  });
}
