"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "~/lib/axios";
import { suppliersKey } from "./use-suppliers";

/**
 * Answers 409 when the supplier has recorded deliveries — those records must keep
 * resolving who delivered, so the row they point at cannot go away.
 */
export async function deleteSupplier(id: string): Promise<void> {
  await api.delete(`/suppliers/${id}`);
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: suppliersKey }),
  });
}
