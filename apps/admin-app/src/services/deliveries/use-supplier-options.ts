"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";

import type { DeliverySupplier } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { deliveriesKey } from "./use-deliveries";

export const supplierOptionsKey = [...deliveriesKey, "supplier-options"] as const;

/**
 * The supplier picker's options — id and code only, from the goods-in API rather than
 * `/suppliers`: recording a delivery must not require the grant that reveals names.
 */
export async function listSupplierOptions(): Promise<DeliverySupplier[]> {
  const { data } = await api.get<BaseResponse<DeliverySupplier[]>>(
    "/deliveries/supplier-options",
  );
  return data.data;
}

export function useSupplierOptions(enabled = true): UseQueryResult<DeliverySupplier[], unknown> {
  return useQuery({
    queryKey: supplierOptionsKey,
    queryFn: listSupplierOptions,
    enabled,
  });
}
