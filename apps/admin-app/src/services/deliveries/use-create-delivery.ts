"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { CreateDeliveryPayload, Delivery } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { deliveriesKey } from "./use-deliveries";

export async function createDelivery(payload: CreateDeliveryPayload): Promise<Delivery> {
  const { data } = await api.post<BaseResponse<Delivery>>("/deliveries", payload);
  return data.data;
}

export function useCreateDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createDelivery,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveriesKey }),
  });
}
