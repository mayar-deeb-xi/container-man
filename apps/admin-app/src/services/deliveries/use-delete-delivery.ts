"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "~/lib/axios";
import { deliveriesKey } from "./use-deliveries";
import { deliveryDetailKey } from "./use-delivery";

/** Drafts only — the API answers 409 for a signed record, which is kept for ten years. */
export async function deleteDelivery(id: string): Promise<void> {
  await api.delete(`/deliveries/${id}`);
}

export function useDeleteDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteDelivery,
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: deliveryDetailKey(id) });
      void queryClient.invalidateQueries({ queryKey: deliveriesKey });
    },
  });
}
