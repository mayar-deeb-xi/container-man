"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";

import type { DeliveryDetail } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { deliveriesKey } from "./use-deliveries";

export const deliveryDetailKey = (id: string) => [...deliveriesKey, "detail", id] as const;

/** The full record: header, pallets in floor order, and the attached files. */
export async function getDelivery(id: string): Promise<DeliveryDetail> {
  const { data } = await api.get<BaseResponse<DeliveryDetail>>(`/deliveries/${id}`);
  return data.data;
}

export function useDelivery(id: string): UseQueryResult<DeliveryDetail, unknown> {
  return useQuery({
    queryKey: deliveryDetailKey(id),
    queryFn: () => getDelivery(id),
    enabled: Boolean(id),
  });
}
