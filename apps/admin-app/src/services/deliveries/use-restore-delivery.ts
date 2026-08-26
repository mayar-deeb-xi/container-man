"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Delivery } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { deliveriesKey } from "./use-deliveries";

/** No conflict case, unlike containers: a delivery number is never reissued. */
export async function restoreDelivery(id: string): Promise<Delivery> {
  const { data } = await api.post<BaseResponse<Delivery>>(`/deliveries/${id}/restore`);
  return data.data;
}

export function useRestoreDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: restoreDelivery,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: deliveriesKey }),
  });
}
