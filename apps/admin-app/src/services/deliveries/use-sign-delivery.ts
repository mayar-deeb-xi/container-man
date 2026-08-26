"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { DeliveryDetail } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { deliveriesKey } from "./use-deliveries";
import { deliveryDetailKey } from "./use-delivery";

/**
 * The sign-off. The signer is the authenticated caller — the request carries no body,
 * because a signature someone else could type would not be one. Answers the fully
 * signed detail; refuses (400) while the record is empty or a pallet is unclassified.
 */
export async function signDelivery(id: string): Promise<DeliveryDetail> {
  const { data } = await api.post<BaseResponse<DeliveryDetail>>(`/deliveries/${id}/sign`);
  return data.data;
}

export function useSignDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: signDelivery,
    onSuccess: (detail) => {
      queryClient.setQueryData(deliveryDetailKey(detail.id), detail);
      void queryClient.invalidateQueries({ queryKey: deliveriesKey });
    },
  });
}
