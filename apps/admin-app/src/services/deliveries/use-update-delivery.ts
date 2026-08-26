"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Delivery, UpdateDeliveryPayload } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { deliveriesKey } from "./use-deliveries";

export async function updateDelivery(
  id: string,
  payload: UpdateDeliveryPayload,
): Promise<Delivery> {
  const { data } = await api.patch<BaseResponse<Delivery>>(`/deliveries/${id}`, payload);
  return data.data;
}

export function useUpdateDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateDeliveryPayload }) =>
      updateDelivery(id, payload),
    // The detail is a different shape (pallets and files embedded), so it is invalidated
    // rather than patched with the row this returns.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: deliveriesKey }),
  });
}
